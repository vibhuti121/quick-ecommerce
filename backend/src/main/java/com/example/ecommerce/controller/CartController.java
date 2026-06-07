package com.example.ecommerce.controller;

import com.example.ecommerce.model.AddToCartRequest;
import com.example.ecommerce.model.Cart;
import com.example.ecommerce.store.CartAssembler;
import com.example.ecommerce.store.CartStore;
import com.example.ecommerce.store.ProductStore;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/cart")
public class CartController {

    private final CartStore cartStore;
    private final ProductStore productStore;
    private final CartAssembler cartAssembler;

    public CartController(CartStore cartStore, ProductStore productStore, CartAssembler cartAssembler) {
        this.cartStore = cartStore;
        this.productStore = productStore;
        this.cartAssembler = cartAssembler;
    }

    @GetMapping
    public Cart getCart() {
        return cartAssembler.build();
    }

    @PostMapping
    public Cart addToCart(@RequestBody AddToCartRequest request) {
        if (request == null || request.productId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "productId is required");
        }

        long productId = request.productId();
        if (productStore.findById(productId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Product " + productId + " not found");
        }

        // quantity is a signed delta (+1 to add, -1 to decrement); 0 is a no-op and rejected.
        int quantity = request.quantity() == null ? 1 : request.quantity();
        if (quantity == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "quantity must be non-zero");
        }

        cartStore.add(productId, quantity);
        return cartAssembler.build();
    }

    @DeleteMapping("/{productId}")
    public Cart removeFromCart(@PathVariable long productId) {
        cartStore.remove(productId);
        return cartAssembler.build();
    }
}
