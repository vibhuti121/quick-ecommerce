package com.varsha.cart.dto;

import jakarta.validation.constraints.NotNull;

/**
 * {@code quantity} is a <em>signed delta</em> (matching the original storefront contract):
 * {@code +1} adds one, {@code -1} decrements; a line whose quantity falls to ≤0 is removed.
 */
public record AddItemRequest(
        @NotNull Long productId,
        @NotNull Integer quantity
) {}
