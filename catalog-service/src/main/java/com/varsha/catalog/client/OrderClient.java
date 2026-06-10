package com.varsha.catalog.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;

/**
 * Reads the co-purchase signal from order-service (which owns the purchase history). This is a
 * BEST-EFFORT call: order-service being slow, down, or erroring must never fail a recommendations
 * request — every failure path logs and returns an empty list so the blend degrades to
 * content-based / category recommendations.
 *
 * <p>Contrast with order-service's {@code InventoryClient}, which distinguishes 4xx/5xx and
 * <em>throws</em> to drive the saga. Here there is no saga to drive: an empty list is a perfectly
 * good answer, so we swallow everything.
 */
@Component
public class OrderClient {

    private static final Logger log = LoggerFactory.getLogger(OrderClient.class);

    private static final ParameterizedTypeReference<List<CoPurchase>> LIST_TYPE =
            new ParameterizedTypeReference<>() {};

    private final RestClient http;

    public OrderClient(RestClient orderRestClient) {
        this.http = orderRestClient;
    }

    /** A product that co-occurred with the anchor in {@code count} distinct CONFIRMED orders. */
    public record CoPurchase(Long productId, long count) {}

    /**
     * Products frequently bought alongside {@code productId}, most-paired first. Returns an empty
     * list on any failure (timeout, unreachable, 4xx/5xx, malformed body) — never throws.
     */
    public List<CoPurchase> coPurchase(Long productId, int limit) {
        try {
            List<CoPurchase> body = http.get()
                    .uri("/api/orders/products/{id}/co-purchase?limit={limit}", productId, limit)
                    .retrieve()
                    .body(LIST_TYPE);
            return body == null ? List.of() : body;
        } catch (Exception e) {
            log.warn("recommendations: co-purchase lookup for product {} failed, degrading to empty: {}",
                    productId, e.toString());
            return List.of();
        }
    }
}
