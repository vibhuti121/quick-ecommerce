package com.example.ecommerce.model;

public record CartItem(
        Product product,
        int quantity
) {
}
