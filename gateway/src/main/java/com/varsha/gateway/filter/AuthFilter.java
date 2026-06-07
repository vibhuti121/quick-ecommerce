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
        // catalog browse is open to anonymous shoppers; writes live under /api/catalog/admin/** and stay protected
        "/api/catalog/products"
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
            return chain.filter(exchange);
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
                ServerHttpRequest mutated = exchange.getRequest().mutate()
                    .header("X-User-Id", userId != null ? userId : "")
                    .header("X-User-Email", email != null ? email : "")
                    .header("X-User-Display-Name", displayName != null ? displayName : "")
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
        return PUBLIC_PATHS.stream().anyMatch(path::startsWith);
    }
}
