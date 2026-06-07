package com.varsha.payment.provider;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * A deterministic stand-in gateway for local dev and tests. Approves every charge EXCEPT a
 * documented test hook: amounts whose paise/cents are exactly 66 (e.g. 100.66) are declined.
 * That lets the checkout saga's failure path (payment fails → release inventory → order FAILED)
 * be exercised end-to-end without a real gateway.
 */
@Component
public class MockPaymentProvider implements PaymentProvider {

    @Override
    public String name() {
        return "mock";
    }

    @Override
    public ChargeOutcome charge(String orderId, BigDecimal amount, String currency) {
        int fractionalUnits = amount.movePointRight(2).remainder(BigDecimal.valueOf(100)).intValue();
        if (fractionalUnits == 66) {
            return ChargeOutcome.declined("Mock decline: card was declined by issuer");
        }
        return ChargeOutcome.approved("mock_" + orderId);
    }
}
