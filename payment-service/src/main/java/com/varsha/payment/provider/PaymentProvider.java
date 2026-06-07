package com.varsha.payment.provider;

import java.math.BigDecimal;

/**
 * Abstraction over a payment gateway. The service depends only on this interface, so swapping the
 * mock for Razorpay/Stripe later is a new bean + a config flag ({@code app.payment.provider}) —
 * no change to PaymentService or the controller.
 */
public interface PaymentProvider {

    /** The id this provider registers under, matched against {@code app.payment.provider}. */
    String name();

    /** Attempt to charge {@code amount} for {@code orderId}. Never throws for a decline — returns it. */
    ChargeOutcome charge(String orderId, BigDecimal amount, String currency);
}
