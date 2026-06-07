package com.varsha.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class SecurityHeadersFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        // beforeCommit fires before the first byte of the response body is written,
        // guaranteeing headers land in the response even for streamed/chunked bodies.
        exchange.getResponse().beforeCommit(() -> {
            ServerHttpResponse response = exchange.getResponse();
            response.getHeaders().set("X-Content-Type-Options", "nosniff");
            response.getHeaders().set("X-Frame-Options", "DENY");
            response.getHeaders().set("Referrer-Policy", "strict-origin-when-cross-origin");
            // camera/microphone self-only — required for WebRTC; block everything else
            response.getHeaders().set("Permissions-Policy",
                    "camera=(self), microphone=(self), geolocation=(), payment=()");
            response.getHeaders().set("X-XSS-Protection", "0");
            return Mono.empty();
        });
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return -5; // outermost filter — registers beforeCommit before any inner filter can commit
    }
}
