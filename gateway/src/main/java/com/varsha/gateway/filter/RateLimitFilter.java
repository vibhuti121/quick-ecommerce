package com.varsha.gateway.filter;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

@Component
public class RateLimitFilter implements GlobalFilter, Ordered {

    private final Cache<String, Bucket> buckets;
    private final int capacity;
    private final int refillTokens;
    private final long refillSeconds;

    public RateLimitFilter(
            @Value("${app.rate-limit.capacity:100}") int capacity,
            @Value("${app.rate-limit.refill-tokens:100}") int refillTokens,
            @Value("${app.rate-limit.refill-duration-seconds:60}") long refillSeconds,
            @Value("${app.rate-limit.max-tracked-ips:20000}") long maxTrackedIps,
            @Value("${app.rate-limit.ip-expire-minutes:10}") long ipExpireMinutes) {
        this.capacity = capacity;
        this.refillTokens = refillTokens;
        this.refillSeconds = refillSeconds;
        this.buckets = Caffeine.newBuilder()
                .expireAfterAccess(ipExpireMinutes, TimeUnit.MINUTES)
                .maximumSize(maxTrackedIps)
                .build();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String ip = extractClientIp(exchange);
        Bucket bucket = buckets.get(ip, k -> newBucket());
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);

        exchange.getResponse().getHeaders().set("X-RateLimit-Limit", String.valueOf(capacity));

        if (probe.isConsumed()) {
            exchange.getResponse().getHeaders().set(
                    "X-RateLimit-Remaining", String.valueOf(probe.getRemainingTokens()));
            return chain.filter(exchange);
        }

        long retryAfterSeconds = TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill()) + 1;
        exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        exchange.getResponse().getHeaders().set("Retry-After", String.valueOf(retryAfterSeconds));
        exchange.getResponse().getHeaders().set("X-RateLimit-Remaining", "0");

        String body = String.format(
                "{\"type\":\"urn:problem:rate-limit-exceeded\",\"title\":\"Too Many Requests\"," +
                "\"status\":429,\"detail\":\"Rate limit of %d requests per %ds exceeded. Retry after %ds.\"}",
                capacity, refillSeconds, retryAfterSeconds);

        DataBuffer buffer = exchange.getResponse().bufferFactory()
                .wrap(body.getBytes(StandardCharsets.UTF_8));
        return exchange.getResponse().writeWith(Mono.just(buffer));
    }

    @Override
    public int getOrder() {
        return -3; // before CorrelationIdFilter (-2) and AuthFilter (-1)
    }

    private Bucket newBucket() {
        return Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(capacity)
                        .refillIntervally(refillTokens, Duration.ofSeconds(refillSeconds))
                        .build())
                .build();
    }

    private String extractClientIp(ServerWebExchange exchange) {
        // Caddy sets X-Forwarded-For; take the first (client) address
        String xff = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        InetSocketAddress remote = exchange.getRequest().getRemoteAddress();
        return remote != null ? remote.getAddress().getHostAddress() : "unknown";
    }
}
