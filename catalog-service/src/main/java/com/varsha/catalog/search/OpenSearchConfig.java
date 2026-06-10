package com.varsha.catalog.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.core5.http.HttpHost;
import org.apache.hc.core5.util.Timeout;
import org.opensearch.client.json.jackson.JacksonJsonpMapper;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.transport.OpenSearchTransport;
import org.opensearch.client.transport.httpclient5.ApacheHttpClient5TransportBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Wires the low-level {@link OpenSearchClient} used by {@link ProductSearchService}.
 *
 * <p>Gated on {@code app.search.enabled} (default true) — setting it false leaves the bean absent,
 * and {@code ProductSearchService} (which injects it via {@code ObjectProvider}) then treats search
 * as unavailable and the endpoint degrades to the Postgres fallback. Building the client opens NO
 * connection (httpclient5 connects lazily on first request), so a down OpenSearch never blocks boot.
 *
 * <p>Short ~2s connect/response timeouts on purpose: a dead or slow OpenSearch must fail FAST into
 * the fallback rather than stalling a request thread. The {@link JacksonJsonpMapper} reuses an
 * {@link ObjectMapper} configured exactly like the cache one ({@link JavaTimeModule}, ISO instants)
 * so document round-trips match the rest of the service.
 */
@Configuration
@ConditionalOnProperty(prefix = "app.search", name = "enabled", havingValue = "true", matchIfMissing = true)
public class OpenSearchConfig {

    @Bean
    public OpenSearchClient openSearchClient(
            @Value("${app.search.host:localhost}") String host,
            @Value("${app.search.port:9200}") int port,
            @Value("${app.search.scheme:http}") String scheme,
            @Value("${app.search.connect-timeout-ms:2000}") int connectTimeoutMs,
            @Value("${app.search.response-timeout-ms:2000}") int responseTimeoutMs) {

        ObjectMapper mapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        RequestConfig requestConfig = RequestConfig.custom()
                .setConnectTimeout(Timeout.ofMilliseconds(connectTimeoutMs))
                .setResponseTimeout(Timeout.ofMilliseconds(responseTimeoutMs))
                .build();

        OpenSearchTransport transport = ApacheHttpClient5TransportBuilder
                .builder(new HttpHost(scheme, host, port))
                .setMapper(new JacksonJsonpMapper(mapper))
                .setHttpClientConfigCallback(b -> b.setDefaultRequestConfig(requestConfig))
                .build();

        return new OpenSearchClient(transport);
    }
}
