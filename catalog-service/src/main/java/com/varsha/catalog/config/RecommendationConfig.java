package com.varsha.catalog.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * catalog-service's first OUTBOUND HTTP client: it calls order-service over the docker network
 * (bypassing the gateway) for the co-purchase recommendation signal. Mirrors order-service's
 * {@code AppConfig} short-timeout pattern.
 *
 * <p>Timeouts are deliberately short. The co-purchase call is best-effort — if order-service is
 * slow or down, we want to fail fast and degrade to content-based / category recommendations
 * rather than stall the request thread (the recommendations endpoint must never 503).
 */
@Configuration
public class RecommendationConfig {

    @Bean
    RestClient orderRestClient(
            @Value("${app.recommendations.order-service-url}") String baseUrl,
            @Value("${app.recommendations.connect-timeout-ms:1500}") long connectMs,
            @Value("${app.recommendations.response-timeout-ms:2000}") long readMs) {
        ClientHttpRequestFactory factory = ClientHttpRequestFactories.get(
                ClientHttpRequestFactorySettings.DEFAULTS
                        .withConnectTimeout(Duration.ofMillis(connectMs))
                        .withReadTimeout(Duration.ofMillis(readMs)));
        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }
}
