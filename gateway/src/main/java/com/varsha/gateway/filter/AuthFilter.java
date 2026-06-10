package com.varsha.gateway.filter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.circuitbreaker.resilience4j.ReactiveResilience4JCircuitBreakerFactory;
import org.springframework.cloud.client.circuitbreaker.ReactiveCircuitBreaker;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Component
public class AuthFilter implements GlobalFilter, Ordered {

    private static final List<String> PUBLIC_PATHS = List.of(
        "/oauth2/", "/login/", "/health",
        "/actuator/",
        "/auth/guest",
        // our own sign-in front doors — the caller has no token yet, so these MUST be public (like
        // /auth/guest). They each end in JwtService.generate(); downstream still only trusts the JWT.
        // Anti-enumeration / rate-limit / attempt-caps are enforced inside auth-service, not here.
        "/auth/register", "/auth/login", "/auth/otp/",
        // catalog browse is open to anonymous shoppers; writes live under /api/catalog/admin/** and stay protected
        "/api/catalog/products",
        // public launch-interest signup ("Notify me"). Note: /api/catalog/admin/notify does NOT startsWith
        // this, so the admin list stays behind the ADMIN_PATHS check below.
        "/api/catalog/notify"
    );

    // Paths that require the ADMIN role (Phase 3, Pillar 1). These all sit OUTSIDE PUBLIC_PATHS,
    // so a request here always reaches the validate+role-check branch below.
    private static final List<String> ADMIN_PATHS = List.of(
        "/api/catalog/admin",
        "/api/inventory/admin"
    );

    // Identity headers the gateway owns. They are stripped from every inbound request and only ever
    // re-set from a validated token, so a client cannot spoof identity/role by sending them directly.
    private static final List<String> IDENTITY_HEADERS = List.of(
        "X-User-Id", "X-User-Email", "X-User-Display-Name", "X-User-Role"
    );

    private final WebClient webClient;
    private final ReactiveCircuitBreaker circuitBreaker;

    @Value("${app.auth-service-url}")
    private String authServiceUrl;

    public AuthFilter(WebClient.Builder builder, ReactiveResilience4JCircuitBreakerFactory cbFactory) {
        this.webClient = builder.build();
        this.circuitBreaker = cbFactory.create("auth-validate");
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getPath().value();

        if (isPublic(path)) {
            // Even on public routes, never let a client's own X-User-* headers reach a service.
            ServerHttpRequest cleaned = exchange.getRequest().mutate()
                .headers(h -> IDENTITY_HEADERS.forEach(h::remove))
                .build();
            return chain.filter(exchange.mutate().request(cleaned).build());
        }

        String authHeader = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        // Retry only on network/infrastructure errors (not 4xx from auth-service).
        // jitter(0.5) adds ±50% randomness to exponential backoff intervals,
        // preventing thundering herd when auth-service recovers after an outage.
        Mono<Map> validateCall = webClient.get()
            .uri(authServiceUrl + "/auth/validate")
            .header("Authorization", authHeader)
            .retrieve()
            .bodyToMono(Map.class)
            .retryWhen(Retry.backoff(2, Duration.ofMillis(50))
                .maxBackoff(Duration.ofMillis(300))
                .jitter(0.5)
                .filter(ex -> !(ex instanceof WebClientResponseException)));

        return circuitBreaker.run(validateCall, throwable -> Mono.error(throwable))
            .flatMap(body -> {
                String userId      = (String) body.get("userId");
                String email       = (String) body.get("email");
                String displayName = (String) body.get("displayName");
                String role        = (String) body.get("role");
                String effectiveRole = role != null ? role : "USER";

                // Authenticated but not authorized: admin route + non-admin role → 403.
                if (requiresAdmin(path) && !"ADMIN".equals(effectiveRole)) {
                    exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                    return exchange.getResponse().setComplete();
                }

                // .header(...) replaces any client-supplied value, so identity/role cannot be spoofed.
                ServerHttpRequest mutated = exchange.getRequest().mutate()
                    .header("X-User-Id", userId != null ? userId : "")
                    .header("X-User-Email", email != null ? email : "")
                    .header("X-User-Display-Name", displayName != null ? displayName : "")
                    .header("X-User-Role", effectiveRole)
                    .build();
                return chain.filter(exchange.mutate().request(mutated).build());
            })
            .onErrorResume(ex -> {
                HttpStatus status = (ex instanceof WebClientResponseException)
                    ? HttpStatus.UNAUTHORIZED
                    : HttpStatus.SERVICE_UNAVAILABLE;
                exchange.getResponse().setStatusCode(status);
                return exchange.getResponse().setComplete();
            });
    }

    @Override
    public int getOrder() {
        return -1;
    }

    private boolean isPublic(String path) {
        if (PUBLIC_PATHS.stream().anyMatch(path::startsWith)) {
            return true;
        }
        // Storefront (B1): the gateway's ONLY protected surfaces are the service APIs under /api/**
        // and /auth/** (their public sub-paths — /auth/guest, /api/catalog/products — are whitelisted
        // above and checked first). Everything the specific routes don't claim falls through to the
        // storefront catch-all and is static SPA content (index.html + hashed /assets) served
        // same-origin — public by nature. This branch must NEVER match /api/ or /auth/, or it would
        // open a protected API; the trailing slash keeps the boundary exact (bare /api has no handler).
        return !path.startsWith("/api/") && !path.startsWith("/auth/");
    }

    private boolean requiresAdmin(String path) {
        return ADMIN_PATHS.stream().anyMatch(path::startsWith);
    }
}
