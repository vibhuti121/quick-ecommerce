package com.varsha.payment.provider;

/**
 * The provider-agnostic result of attempting a charge.
 *
 * @param success     whether the gateway approved the charge
 * @param providerRef the gateway's reference id for the transaction (null on failure)
 * @param failureReason human-readable decline reason (null on success)
 */
public record ChargeOutcome(boolean success, String providerRef, String failureReason) {

    public static ChargeOutcome approved(String providerRef) {
        return new ChargeOutcome(true, providerRef, null);
    }

    public static ChargeOutcome declined(String reason) {
        return new ChargeOutcome(false, null, reason);
    }
}
