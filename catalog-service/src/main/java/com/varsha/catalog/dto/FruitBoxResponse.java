package com.varsha.catalog.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Response body for POST /api/catalog/fruit-xi/box.
 */
public record FruitBoxResponse(
        String team,
        List<FruitBoxItem> items,
        List<ExcludedItem> excluded,
        BigDecimal total
) {
    /**
     * One entry in the excluded list — tells the caller why a productId didn't make the box.
     */
    public record ExcludedItem(Long productId, String reason) {}
}
