package com.varsha.order.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Configuration
public class AppConfig {

    private ClientHttpRequestFactory shortTimeoutFactory() {
        // Fail fast: a downstream that doesn't answer in a few seconds is treated as transient
        // (the saga retries on the next poll) rather than tying up the poller thread.
        return ClientHttpRequestFactories.get(
                ClientHttpRequestFactorySettings.DEFAULTS
                        .withConnectTimeout(Duration.ofSeconds(2))
                        .withReadTimeout(Duration.ofSeconds(5)));
    }

    // NOTE: both beans take the Boot auto-configured RestClient.Builder by injection rather than
    // the static RestClient.builder() factory. Only the injected builder carries the observation
    // instrumentation that propagates the W3C traceparent header on every outbound hop — using the
    // static factory would silently break the distributed trace at the order->inventory/payment
    // boundary (Pillar 1). See docs/observability-strategy.md.
    @Bean
    RestClient inventoryRestClient(RestClient.Builder builder,
                                   @Value("${app.inventory-service-url}") String baseUrl) {
        return builder
                .baseUrl(baseUrl)
                .requestFactory(shortTimeoutFactory())
                .build();
    }

    @Bean
    RestClient paymentRestClient(RestClient.Builder builder,
                                 @Value("${app.payment-service-url}") String baseUrl) {
        return builder
                .baseUrl(baseUrl)
                .requestFactory(shortTimeoutFactory())
                .build();
    }
}
