package com.varsha.payment.provider;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Cash-on-Delivery provider for the pilot. No money moves online — payment is collected in cash when
 * the founder hands the goods over — so every charge is "approved" here. This lets a COD order flow
 * through the existing checkout saga unchanged: inventory is still reserved/committed (stock remains
 * the only gate), the order reaches CONFIRMED, and fulfillment is tracked separately via deliveryStatus.
 *
 * Selected when {@code PAYMENT_PROVIDER=cod} (matched against {@code app.payment.provider}).
 */
@Component
public class CodPaymentProvider implements PaymentProvider {

    @Override
    public String name() {
        return "cod";
    }

    @Override
    public ChargeOutcome charge(String orderId, BigDecimal amount, String currency) {
        return ChargeOutcome.approved("cod_" + orderId);
    }
}
