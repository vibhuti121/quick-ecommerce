package com.varsha.cart.service;

import com.varsha.cart.client.CatalogClient;
import com.varsha.cart.client.ProductView;
import com.varsha.cart.model.Cart;
import com.varsha.cart.model.CartItem;
import com.varsha.cart.repository.CartRepository;
import org.springframework.stereotype.Service;

@Service
public class CartService {

    private final CartRepository carts;
    private final CatalogClient catalog;

    public CartService(CartRepository carts, CatalogClient catalog) {
        this.carts = carts;
        this.catalog = catalog;
    }

    public Cart getCart(String userId) {
        return carts.find(userId).orElseGet(() -> new Cart(userId));
    }

    /**
     * Apply a signed quantity delta to a line. New lines snapshot the product from the catalog;
     * existing lines just adjust quantity (no catalog call). A line at ≤0 is removed.
     */
    public Cart addItem(String userId, Long productId, int delta) {
        Cart cart = getCart(userId);
        CartItem existing = cart.getItems().get(productId);
        int newQty = (existing == null ? 0 : existing.getQuantity()) + delta;

        if (newQty <= 0) {
            cart.getItems().remove(productId);
        } else if (existing != null) {
            existing.setQuantity(newQty);
        } else {
            ProductView p = catalog.fetch(productId);
            cart.getItems().put(productId,
                    new CartItem(p.id(), p.sku(), p.name(), p.imageUrl(), p.basePrice(), newQty));
        }

        carts.save(cart);
        return cart;
    }

    public Cart removeItem(String userId, Long productId) {
        Cart cart = getCart(userId);
        cart.getItems().remove(productId);
        carts.save(cart);
        return cart;
    }

    public Cart clear(String userId) {
        carts.delete(userId);
        return new Cart(userId);
    }
}
