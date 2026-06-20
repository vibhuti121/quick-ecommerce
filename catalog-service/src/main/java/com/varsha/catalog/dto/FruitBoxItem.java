package com.varsha.catalog.dto;

import java.math.BigDecimal;

/**
 * One line-item in a FruitBox response — the subset of ProductResponse consumed by the
 * add-to-cart path (same fields cart-service reads from the catalog browse response).
 */
public record FruitBoxItem(
        Long productId,
        String sku,
        String name,
        BigDecimal basePrice,
        String currency,
        String imageUrl,
        int quantity      // always 1 per contract
) {}
