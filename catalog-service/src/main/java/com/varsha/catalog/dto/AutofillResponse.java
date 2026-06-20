package com.varsha.catalog.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Response body for POST /api/catalog/fruit-xi/autofill.
 */
public record AutofillResponse(
        String team,
        int requested,    // always 11
        int filled,       // actual items returned (may be <11 if pool is small)
        List<AutofillItem> items
) {
    /**
     * One autofill pick — enriched with the colour-bucket and the rule that assigned it
     * (for transparency / testability).
     */
    public record AutofillItem(
            Long productId,
            String sku,
            String name,
            BigDecimal basePrice,
            String currency,
            String imageUrl,
            String colorBucket,    // enum name: RED | ORANGE | YELLOW | GREEN | PURPLE | WHITE | UNCLASSIFIED
            String explain         // "attribute:kitColor", "keyword:alphonso", "unclassified", etc.
    ) {}
}
