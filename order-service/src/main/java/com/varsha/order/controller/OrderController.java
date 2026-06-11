package com.varsha.order.controller;

import com.varsha.order.dto.Dtos.CheckoutRequest;
import com.varsha.order.dto.Dtos.OrderResponse;
import com.varsha.order.exception.OrderExceptions.BadRequestException;
import com.varsha.order.exception.OrderExceptions.ForbiddenException;
import com.varsha.order.exception.OrderExceptions.UnauthorizedException;
import com.varsha.order.service.CheckoutService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Order API. Identity comes from the gateway-injected {@code X-User-Id} header — this service trusts
 * it and does NOT re-validate the JWT (the gateway already did). Checkout requires an
 * {@code Idempotency-Key} so client retries never create or charge a second order.
 */
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final CheckoutService checkout;

    public OrderController(CheckoutService checkout) {
        this.checkout = checkout;
    }

    @PostMapping("/checkout")
    public ResponseEntity<OrderResponse> checkout(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CheckoutRequest req) {
        String uid = requireNonGuestUser(userId);
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new BadRequestException("Missing required Idempotency-Key header");
        }
        OrderResponse order = checkout.checkout(uid, idempotencyKey, req);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(order);
    }

    @GetMapping("/{orderId}")
    public OrderResponse get(@PathVariable String orderId) {
        return checkout.getByOrderId(orderId);
    }

    @GetMapping
    public List<OrderResponse> list(
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        return checkout.listForUser(requireUser(userId));
    }

    private String requireUser(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new UnauthorizedException("Missing X-User-Id header");
        }
        return userId;
    }

    /**
     * Checkout requires a real (signed-in) account. Guest tokens carry an {@code X-User-Id} of
     * {@code guest-<uuid>}; we reject those so an anonymous browser cannot place an order. Browsing
     * and cart-building stay guest-friendly; only this write is gated. Mirrors videocall-service's
     * guest guard.
     */
    private String requireNonGuestUser(String userId) {
        String uid = requireUser(userId);
        if (uid.startsWith("guest-")) {
            throw new ForbiddenException("Please sign in to place an order");
        }
        return uid;
    }
}
