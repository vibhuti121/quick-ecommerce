package com.varsha.order.exception;

public final class OrderExceptions {

    private OrderExceptions() {
    }

    /** Order not found. */
    public static class NotFoundException extends RuntimeException {
        public NotFoundException(String message) {
            super(message);
        }
    }

    /** No / blank X-User-Id header (gateway should always inject it). */
    public static class UnauthorizedException extends RuntimeException {
        public UnauthorizedException(String message) {
            super(message);
        }
    }

    /** Authenticated but not allowed — e.g. a guest token trying to place an order. */
    public static class ForbiddenException extends RuntimeException {
        public ForbiddenException(String message) {
            super(message);
        }
    }

    /** Missing the required Idempotency-Key header on checkout. */
    public static class BadRequestException extends RuntimeException {
        public BadRequestException(String message) {
            super(message);
        }
    }
}
