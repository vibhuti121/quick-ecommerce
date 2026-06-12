package com.varsha.cart.service;

import com.varsha.cart.client.CatalogClient;
import com.varsha.cart.client.ProductView;
import com.varsha.cart.exception.CartExceptions.HoneyNotBuyableException;
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
            // Server-side honey gate: honey is a pre-launch "coming soon" SKU that renders in the
            // catalog but is never purchasable. The storefront already routes it to the drop list,
            // but this makes not-buyable airtight at the API. The new-line branch is the only place
            // honey can enter a cart — the increment branch above never fetches category and is
            // unreachable for honey, since a honey line could never have been added in the first place.
            if ("honey".equalsIgnoreCase(p.category())) {
                throw new HoneyNotBuyableException("This item is coming soon and can't be added to the cart yet.");
            }
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
