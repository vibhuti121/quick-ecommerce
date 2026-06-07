package com.example.ecommerce.model;

public record Product(
        long id,
        String name,
        String description,
        double price,
        String imageUrl,
        String category
) {
}
