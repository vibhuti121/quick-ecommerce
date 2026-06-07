package com.varsha.order.client;

public final class ClientExceptions {

    private ClientExceptions() {
    }

    /**
     * A BUSINESS rejection from a downstream service (e.g. insufficient stock, unknown SKU). The
     * saga treats this as terminal: fail the order, do not retry.
     */
    public static class BusinessRejectionException extends RuntimeException {
        public BusinessRejectionException(String message) {
            super(message);
        }
    }

    /**
     * A TRANSIENT failure from a downstream service (timeout, connection refused, 5xx). The saga
     * leaves the outbox event PENDING so the next poll retries.
     */
    public static class ServiceUnavailableException extends RuntimeException {
        public ServiceUnavailableException(String message) {
            super(message);
        }
    }
}
