package com.varsha.payment.dto;

import com.varsha.payment.model.Payment;
import com.varsha.payment.model.PaymentStatus;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/** Request/response payloads for payment operations. */
public final class Dtos {

    private Dtos() {
    }

    public record ChargeRequest(
            @NotBlank String orderId,
            @NotNull @DecimalMin("0.00") BigDecimal amount,
            @NotBlank String currency
    ) {}

    public record PaymentResponse(
            String orderId,
            BigDecimal amount,
            String currency,
            PaymentStatus status,
            String provider,
            String providerRef,
            String failureReason
    ) {
        public static PaymentResponse from(Payment p) {
            return new PaymentResponse(
                    p.getOrderId(),
                    p.getAmount(),
                    p.getCurrency(),
                    p.getStatus(),
                    p.getProvider(),
                    p.getProviderRef(),
                    p.getFailureReason()
            );
        }
    }
}
