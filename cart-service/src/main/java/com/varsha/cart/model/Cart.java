package com.varsha.cart.model;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A user's cart, stored as a single JSON blob in Redis under {@code cart:{userId}}.
 * Items are keyed by productId so add/remove are O(1) and quantities merge naturally.
 */
public class Cart {

    private String userId;
    private Map<Long, CartItem> items = new LinkedHashMap<>();

    public Cart() {
    }

    public Cart(String userId) {
        this.userId = userId;
    }

    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    public BigDecimal getTotal() {
        return items.values().stream()
                .map(CartItem::getLineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    public int getItemCount() {
        return items.values().stream().mapToInt(CartItem::getQuantity).sum();
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public Map<Long, CartItem> getItems() { return items; }
    public void setItems(Map<Long, CartItem> items) { this.items = items; }
}
