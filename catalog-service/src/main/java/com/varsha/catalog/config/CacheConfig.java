package com.varsha.catalog.config;

import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.varsha.catalog.dto.CachedPage;
import com.varsha.catalog.dto.ProductResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext.SerializationPair;

import java.time.Duration;

/**
 * Redis caching for the read-heavy catalog path.
 *
 * <p><b>Typed serializers, not default typing.</b> Each cache holds exactly one value shape
 * ({@code catalog:product} → {@link ProductResponse}, {@code catalog:browse} →
 * {@code CachedPage<ProductResponse>}), so we bind a {@link Jackson2JsonRedisSerializer} to that
 * concrete type per cache. This deliberately avoids {@code GenericJackson2JsonRedisSerializer} +
 * Jackson default typing: that path writes a {@code @class} type id only for non-final types, but
 * Java records are implicitly {@code final}, so the id was silently omitted on write yet required on
 * read → {@code SerializationException: missing type id property '@class'}, which degraded every
 * cache HIT into a stealth DB read. Typed serializers need no {@code @class} at all and round-trip
 * records reliably.
 *
 * <p>{@code Instant} fields force a {@link JavaTimeModule} on the cache {@code ObjectMapper}.
 * {@code disableCachingNullValues()} — the cached methods never return null (a missing product
 * throws) — so Spring's {@code NullValue} machinery is skipped.
 *
 * <p>Implements {@link CachingConfigurer} so the log-and-degrade {@link CacheErrorHandler} is
 * actually wired into the cache interceptor — a bare {@code @Bean CacheErrorHandler} is NOT
 * auto-detected by Spring's caching infrastructure.
 */
@Configuration
@EnableCaching
public class CacheConfig implements CachingConfigurer {

    static final String PRODUCT_CACHE = "catalog:product";
    static final String BROWSE_CACHE = "catalog:browse";

    @Bean
    public RedisCacheManager cacheManager(
            RedisConnectionFactory connectionFactory,
            @Value("${app.cache.product-ttl-seconds:3600}") long productTtlSeconds,
            @Value("${app.cache.browse-ttl-seconds:600}") long browseTtlSeconds) {

        ObjectMapper mapper = cacheObjectMapper();

        RedisCacheConfiguration productConfig = RedisCacheConfiguration.defaultCacheConfig()
                .disableCachingNullValues()
                .entryTtl(Duration.ofSeconds(productTtlSeconds))
                .serializeValuesWith(SerializationPair.fromSerializer(
                        new Jackson2JsonRedisSerializer<>(mapper, ProductResponse.class)));

        // CachedPage is generic; build the parametric type so its `content` list deserializes as
        // List<ProductResponse> rather than List<LinkedHashMap>.
        JavaType browseType = mapper.getTypeFactory()
                .constructParametricType(CachedPage.class, ProductResponse.class);
        RedisCacheConfiguration browseConfig = RedisCacheConfiguration.defaultCacheConfig()
                .disableCachingNullValues()
                .entryTtl(Duration.ofSeconds(browseTtlSeconds))
                .serializeValuesWith(SerializationPair.fromSerializer(
                        new Jackson2JsonRedisSerializer<>(mapper, browseType)));

        return RedisCacheManager.builder(connectionFactory)
                .withCacheConfiguration(PRODUCT_CACHE, productConfig)
                .withCacheConfiguration(BROWSE_CACHE, browseConfig)
                // Only the two typed caches above are valid; a typo'd cache name should fail loudly
                // rather than silently fall back to JDK serialization on an unconfigured cache.
                .disableCreateOnMissingCache()
                // Without this, RedisCache reports zero gets/hits/misses → cache_gets_total stays flat
                // in Prometheus/Grafana. Enables the per-cache hit/miss counters the dashboard needs.
                .enableStatistics()
                .build();
    }

    /**
     * Resilience: a Redis outage logs a warning and degrades to a direct DB read instead of failing
     * the request. Picked up via {@link CachingConfigurer} (not as a standalone bean).
     */
    @Override
    public CacheErrorHandler errorHandler() {
        return new LoggingCacheErrorHandler();
    }

    private ObjectMapper cacheObjectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return mapper;
    }
}
