package com.example.ecommerce.controller;

import com.example.ecommerce.model.Cart;
import com.example.ecommerce.model.Order;
import com.example.ecommerce.store.CartAssembler;
import com.example.ecommerce.store.CartStore;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final CartStore cartStore;
    private final CartAssembler cartAssembler;

    public OrderController(CartStore cartStore, CartAssembler cartAssembler) {
        this.cartStore = cartStore;
        this.cartAssembler = cartAssembler;
    }

    @PostMapping
    public Order placeOrder() {
        Cart cart = cartAssembler.build();
        if (cart.items().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cart is empty");
        }

        Order order = new Order(
                UUID.randomUUID().toString(),
                cart.items(),
                cart.total(),
                Instant.now().toString()
        );

        cartStore.clear();
        return order;
    }
}
