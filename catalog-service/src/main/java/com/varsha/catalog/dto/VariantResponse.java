package com.varsha.catalog.dto;

import com.varsha.catalog.model.Variant;

import java.math.BigDecimal;
import java.util.Map;

public record VariantResponse(
        Long id,
        String sku,
        String name,
        BigDecimal priceDelta,
        Map<String, Object> attributes
) {
    public static VariantResponse from(Variant v) {
        return new VariantResponse(v.getId(), v.getSku(), v.getName(), v.getPriceDelta(), v.getAttributes());
    }
}
