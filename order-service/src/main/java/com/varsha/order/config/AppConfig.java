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

    @Bean
    RestClient inventoryRestClient(@Value("${app.inventory-service-url}") String baseUrl) {
        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(shortTimeoutFactory())
                .build();
    }

    @Bean
    RestClient paymentRestClient(@Value("${app.payment-service-url}") String baseUrl) {
        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(shortTimeoutFactory())
                .build();
    }
}
