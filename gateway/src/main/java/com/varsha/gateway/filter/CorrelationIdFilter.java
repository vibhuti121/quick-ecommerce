package com.varsha.gateway.filter;

import org.slf4j.MDC;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.UUID;

@Component
public class CorrelationIdFilter implements GlobalFilter, Ordered {

    static final String CORRELATION_HEADER = "X-Correlation-ID";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String cid = exchange.getRequest().getHeaders().getFirst(CORRELATION_HEADER);
        if (cid == null || cid.isBlank()) {
            cid = UUID.randomUUID().toString();
        }
        final String correlationId = cid;

        ServerHttpRequest mutated = exchange.getRequest().mutate()
            .header(CORRELATION_HEADER, correlationId)
            .build();

        exchange.getResponse().beforeCommit(() -> {
            exchange.getResponse().getHeaders().set(CORRELATION_HEADER, correlationId);
            return Mono.empty();
        });

        return chain.filter(exchange.mutate().request(mutated).build())
            .doOnSubscribe(s -> MDC.put(CORRELATION_HEADER, correlationId))
            .doFinally(s -> MDC.remove(CORRELATION_HEADER));
    }

    @Override
    public int getOrder() {
        return -4; // before RateLimitFilter (-3) so correlation ID appears on all responses including 429
    }
}
