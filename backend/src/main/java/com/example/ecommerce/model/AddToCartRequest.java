package com.example.ecommerce.model;

public record AddToCartRequest(
        Long productId,
        Integer quantity
) {
}
