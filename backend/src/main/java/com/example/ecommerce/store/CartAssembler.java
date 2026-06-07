package com.example.ecommerce.store;

import com.example.ecommerce.model.Cart;
import com.example.ecommerce.model.CartItem;
import com.example.ecommerce.model.Product;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Builds a fully-resolved {@link Cart} (with product details and rounded total)
 * from the raw productId -> quantity state held by {@link CartStore}.
 */
@Component
public class CartAssembler {

    private final CartStore cartStore;
    private final ProductStore productStore;

    public CartAssembler(CartStore cartStore, ProductStore productStore) {
        this.cartStore = cartStore;
        this.productStore = productStore;
    }

    public Cart build() {
        List<CartItem> items = new ArrayList<>();
        double rawTotal = 0.0;

        for (Map.Entry<Long, Integer> entry : cartStore.snapshot().entrySet()) {
            Product product = productStore.findById(entry.getKey()).orElse(null);
            if (product == null) {
                continue; // skip lines whose product no longer exists
            }
            int qty = entry.getValue();
            items.add(new CartItem(product, qty));
            rawTotal += product.price() * qty;
        }

        double total = BigDecimal.valueOf(rawTotal)
                .setScale(2, RoundingMode.HALF_UP)
                .doubleValue();

        return new Cart(items, total);
    }
}
