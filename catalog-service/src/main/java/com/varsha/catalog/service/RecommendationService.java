package com.varsha.catalog.service;

import com.varsha.catalog.client.OrderClient;
import com.varsha.catalog.dto.ProductResponse;
import com.varsha.catalog.exception.SearchUnavailableException;
import com.varsha.catalog.search.ProductSearchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Hybrid "you may also like" recommendations: <b>co-purchase first</b> (the behavioral signal —
 * what customers actually bought together, owned by order-service) then <b>content-based</b>
 * (OpenSearch {@code more_like_this} similarity) to fill remaining slots and cover cold-start
 * products with no purchase history yet.
 *
 * <p><b>Never 503s.</b> Both signals are best-effort: order-service down → co-purchase empty;
 * OpenSearch down → content-based empty. If the blend ends up empty (brand-new catalog, niche
 * product), a same-category Postgres browse is the last-resort fallback. The only error this
 * surfaces is a 404 when the anchor product itself does not exist.
 */
@Service
public class RecommendationService {

    private static final Logger log = LoggerFactory.getLogger(RecommendationService.class);

    /** Hard ceiling so a caller can't request an unbounded blend / aggregation. */
    private static final int MAX_SIZE = 24;

    private final ProductReader reader;
    private final OrderClient orderClient;
    private final ProductSearchService search;
    private final boolean coPurchaseEnabled;
    private final int sizeDefault;

    public RecommendationService(ProductReader reader, OrderClient orderClient, ProductSearchService search,
                                 @Value("${app.recommendations.enabled:true}") boolean coPurchaseEnabled,
                                 @Value("${app.recommendations.size-default:8}") int sizeDefault) {
        this.reader = reader;
        this.orderClient = orderClient;
        this.search = search;
        this.coPurchaseEnabled = coPurchaseEnabled;
        this.sizeDefault = sizeDefault;
    }

    /**
     * Recommendations for the anchor product, blended and capped at {@code size}.
     *
     * @throws com.varsha.catalog.exception.NotFoundException if the anchor product does not exist.
     */
    public List<ProductResponse> recommend(Long id, int size) {
        ProductResponse anchor = reader.findProduct(id);   // 404 if absent — the one hard failure
        int limit = clampSize(size);

        // 1. Co-purchase (best-effort, behavioral). Ranked by pair count; empty if order-service down.
        List<Long> coPurchaseIds = coPurchaseEnabled
                ? orderClient.coPurchase(id, limit).stream().map(OrderClient.CoPurchase::productId).toList()
                : List.of();

        // 2. Content-based (best-effort, similarity). Already filters active + excludes the anchor.
        List<ProductResponse> contentBased = List.of();
        try {
            contentBased = search.moreLikeThis(id, PageRequest.of(0, limit)).getContent();
        } catch (SearchUnavailableException e) {
            log.warn("recommendations: content-based unavailable for product {}, degrading: {}", id, e.toString());
        }

        // 3. Blend: co-purchase first (resolved to active products, ranking preserved), content fills.
        Map<Long, ProductResponse> blended = new LinkedHashMap<>();
        for (ProductResponse p : reader.findByIds(coPurchaseIds)) {
            if (!p.id().equals(id)) {
                blended.putIfAbsent(p.id(), p);
            }
        }
        for (ProductResponse p : contentBased) {
            if (blended.size() >= limit) {
                break;
            }
            if (!p.id().equals(id) && p.active()) {
                blended.putIfAbsent(p.id(), p);
            }
        }

        List<ProductResponse> result = new ArrayList<>(blended.values());
        if (result.size() > limit) {
            result = result.subList(0, limit);
        }

        // 4. Cold-start fallback: nothing blended → same-category siblings (guarantees a useful page).
        if (result.isEmpty()) {
            result = reader.sameCategoryFallback(anchor.category(), id, limit);
        }
        return result;
    }

    private int clampSize(int size) {
        int s = size <= 0 ? sizeDefault : size;
        return Math.max(1, Math.min(s, MAX_SIZE));
    }
}
