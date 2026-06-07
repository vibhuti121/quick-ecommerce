package com.varsha.gateway.filter;

import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.bulkhead.BulkheadFullException;
import io.github.resilience4j.bulkhead.BulkheadRegistry;
import io.github.resilience4j.reactor.bulkhead.operator.BulkheadOperator;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.Set;

@Component
public class BulkheadFilter implements GlobalFilter, Ordered {

    private static final Set<String> PROTECTED_ROUTES = Set.of(
        "auth-service", "room-service", "community-service"
    );

    private final BulkheadRegistry bulkheadRegistry;

    public BulkheadFilter(BulkheadRegistry bulkheadRegistry) {
        this.bulkheadRegistry = bulkheadRegistry;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        Route route = exchange.getAttribute(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR);
        if (route == null || !PROTECTED_ROUTES.contains(route.getId())) {
            return chain.filter(exchange);
        }

        Bulkhead bulkhead = bulkheadRegistry.bulkhead(route.getId());

        return chain.filter(exchange)
            .transformDeferred(BulkheadOperator.of(bulkhead))
            .onErrorResume(BulkheadFullException.class, ex -> {
                exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
                exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_PROBLEM_JSON);
                byte[] body = ("{\"status\":429,\"type\":\"urn:problem:too-many-requests\"," +
                    "\"title\":\"Too Many Requests\"," +
                    "\"detail\":\"Service is at capacity. Please retry in a moment.\"}").getBytes();
                var buffer = exchange.getResponse().bufferFactory().wrap(body);
                return exchange.getResponse().writeWith(Mono.just(buffer));
            });
    }

    @Override
    public int getOrder() {
        return 1; // after AuthFilter at order -1
    }
}
