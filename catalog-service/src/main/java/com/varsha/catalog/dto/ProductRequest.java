package com.varsha.catalog.dto;

import com.varsha.catalog.model.ProductType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record ProductRequest(
        @NotBlank String sku,
        @NotBlank String name,
        String description,
        @NotNull ProductType productType,
        String category,
        @NotNull @DecimalMin("0.0") BigDecimal basePrice,
        String currency,
        String imageUrl,
        Map<String, Object> attributes,
        Boolean active,
        @Valid List<VariantRequest> variants
) {}
