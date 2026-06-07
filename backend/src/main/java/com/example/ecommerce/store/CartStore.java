package com.example.ecommerce.store;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class CartStore {

    // Insertion-ordered map of productId -> quantity for a single demo cart.
    private final Map<Long, Integer> items = new LinkedHashMap<>();

    public synchronized Map<Long, Integer> snapshot() {
        return new LinkedHashMap<>(items);
    }

    // quantity is a signed delta; a line that drops to <= 0 is removed.
    public synchronized void add(long productId, int quantity) {
        int updated = items.merge(productId, quantity, Integer::sum);
        if (updated <= 0) {
            items.remove(productId);
        }
    }

    public synchronized void remove(long productId) {
        items.remove(productId);
    }

    public synchronized void clear() {
        items.clear();
    }
}
