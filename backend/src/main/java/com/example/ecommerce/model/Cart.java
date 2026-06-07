package com.example.ecommerce.model;

import java.util.List;

public record Cart(
        List<CartItem> items,
        double total
) {
}
