package com.varsha.payment.controller;

import com.varsha.payment.dto.Dtos.ChargeRequest;
import com.varsha.payment.dto.Dtos.PaymentResponse;
import com.varsha.payment.service.PaymentService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Payment API. {@code POST /charge} is the saga hook called by order-service's poller; it is
 * idempotent on orderId so a retried saga step never double-charges.
 */
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private final PaymentService payments;

    public PaymentController(PaymentService payments) {
        this.payments = payments;
    }

    @PostMapping("/charge")
    public PaymentResponse charge(@Valid @RequestBody ChargeRequest req) {
        return payments.charge(req);
    }

    @GetMapping("/{orderId}")
    public PaymentResponse get(@PathVariable String orderId) {
        return payments.getByOrderId(orderId);
    }
}
