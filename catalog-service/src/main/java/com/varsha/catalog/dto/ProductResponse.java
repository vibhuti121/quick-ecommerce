package com.varsha.catalog.dto;

import com.varsha.catalog.model.Product;
import com.varsha.catalog.model.ProductType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public record ProductResponse(
        Long id,
        String sku,
        String name,
        String description,
        ProductType productType,
        String category,
        BigDecimal basePrice,
        String currency,
        String imageUrl,
        Map<String, Object> attributes,
        boolean active,
        Instant createdAt,
        Instant updatedAt,
        List<VariantResponse> variants
) {
    public static ProductResponse from(Product p) {
        return new ProductResponse(
                p.getId(),
                p.getSku(),
                p.getName(),
                p.getDescription(),
                p.getProductType(),
                p.getCategory(),
                p.getBasePrice(),
                p.getCurrency(),
                p.getImageUrl(),
                p.getAttributes(),
                p.isActive(),
                p.getCreatedAt(),
                p.getUpdatedAt(),
                p.getVariants().stream().map(VariantResponse::from).toList()
        );
    }
}
