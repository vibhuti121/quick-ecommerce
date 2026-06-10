package com.varsha.order.controller;

import com.varsha.order.dto.Dtos.CoPurchaseResponse;
import com.varsha.order.repository.OrderRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Internal co-purchase data feed for the recommendations pillar. order-service owns the purchase
 * history, so it owns this signal; catalog-service calls it service-to-service over the docker
 * network (NOT via the gateway) and blends the result with content-based hits.
 *
 * <p>This endpoint is read-only and exposes no PII (product ids + counts only), so it carries no
 * auth — it sits outside the {@code /admin/orders} prefix that {@link com.varsha.order.config.AdminRoleFilter}
 * guards. It is also not routed by the gateway, so it is unreachable from the public edge.
 */
@RestController
public class RecommendationDataController {

    /** Hard cap so a caller can't request an unbounded aggregation. */
    private static final int MAX_LIMIT = 50;

    private final OrderRepository orders;

    public RecommendationDataController(OrderRepository orders) {
        this.orders = orders;
    }

    @GetMapping("/api/orders/products/{productId}/co-purchase")
    public List<CoPurchaseResponse> coPurchase(
            @PathVariable Long productId,
            @RequestParam(defaultValue = "10") int limit) {
        int capped = Math.max(1, Math.min(limit, MAX_LIMIT));
        return orders.findCoPurchased(productId, capped).stream()
                .map(r -> new CoPurchaseResponse(r.getProductId(), r.getCnt()))
                .toList();
    }
}
