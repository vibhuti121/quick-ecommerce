package com.varsha.catalog.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.util.Map;

public record VariantRequest(
        @NotBlank String sku,
        @NotBlank String name,
        BigDecimal priceDelta,
        Map<String, Object> attributes
) {}
