package com.varsha.cart.controller;

import com.varsha.cart.dto.AddItemRequest;
import com.varsha.cart.exception.CartExceptions.UnauthorizedException;
import com.varsha.cart.model.Cart;
import com.varsha.cart.service.CartService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Cart API. The gateway's AuthFilter validates the JWT once and injects {@code X-User-Id};
 * this service trusts that header and never re-validates the token.
 */
@RestController
@RequestMapping("/api/cart")
public class CartController {

    private static final String USER_HEADER = "X-User-Id";

    private final CartService cart;

    public CartController(CartService cart) {
        this.cart = cart;
    }

    private String requireUser(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new UnauthorizedException("Missing " + USER_HEADER + " header");
        }
        return userId;
    }

    @GetMapping
    public Cart getCart(@RequestHeader(value = USER_HEADER, required = false) String userId) {
        return cart.getCart(requireUser(userId));
    }

    @PostMapping("/items")
    public Cart addItem(@RequestHeader(value = USER_HEADER, required = false) String userId,
                        @Valid @RequestBody AddItemRequest req) {
        return cart.addItem(requireUser(userId), req.productId(), req.quantity());
    }

    @DeleteMapping("/items/{productId}")
    public Cart removeItem(@RequestHeader(value = USER_HEADER, required = false) String userId,
                           @PathVariable Long productId) {
        return cart.removeItem(requireUser(userId), productId);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.OK)
    public Cart clear(@RequestHeader(value = USER_HEADER, required = false) String userId) {
        return cart.clear(requireUser(userId));
    }
}
