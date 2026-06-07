package com.varsha.cart.client;

import java.math.BigDecimal;

/** The slice of a catalog product the cart needs to snapshot. Extra JSON fields are ignored. */
public record ProductView(
        Long id,
        String sku,
        String name,
        String imageUrl,
        BigDecimal basePrice
) {}
