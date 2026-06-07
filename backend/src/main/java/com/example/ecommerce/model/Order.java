package com.example.ecommerce.model;

import java.util.List;

public record Order(
        String orderId,
        List<CartItem> items,
        double total,
        String placedAt
) {
}
