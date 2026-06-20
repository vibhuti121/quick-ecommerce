package com.varsha.catalog.dto;

import java.util.List;

/**
 * Request body for POST /api/catalog/fruit-xi/box.
 * lineup is the caller-supplied ordered list of productIds.
 */
public record FruitBoxRequest(
        String team,
        List<Long> lineup
) {}
