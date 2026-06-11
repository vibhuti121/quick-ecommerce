package com.varsha.cart.config;

import com.varsha.cart.model.Cart;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Configuration
public class AppConfig {

    // Inject the Boot auto-configured RestClient.Builder (not the static RestClient.builder()
    // factory): only the injected builder carries the observation instrumentation that propagates
    // the W3C traceparent header, keeping the cart->catalog hop on the same distributed trace
    // (Pillar 1). See docs/observability-strategy.md.
    @Bean
    public RestClient catalogRestClient(RestClient.Builder builder,
                                        @Value("${app.catalog-service-url}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(3));
        return builder
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }

    /** Carts serialized as JSON (human-inspectable in Redis) keyed by a plain string. */
    @Bean
    public RedisTemplate<String, Cart> cartRedisTemplate(RedisConnectionFactory cf) {
        RedisTemplate<String, Cart> template = new RedisTemplate<>();
        template.setConnectionFactory(cf);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
        template.afterPropertiesSet();
        return template;
    }
}
