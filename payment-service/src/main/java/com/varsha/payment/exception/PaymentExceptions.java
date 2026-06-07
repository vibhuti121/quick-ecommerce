package com.varsha.payment.exception;

public final class PaymentExceptions {

    private PaymentExceptions() {
    }

    /** Payment record not found. */
    public static class NotFoundException extends RuntimeException {
        public NotFoundException(String message) {
            super(message);
        }
    }

    /** No PaymentProvider registered under the configured name. */
    public static class ProviderMisconfiguredException extends RuntimeException {
        public ProviderMisconfiguredException(String message) {
            super(message);
        }
    }
}
