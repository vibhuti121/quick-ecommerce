package com.varsha.cart.exception;

/** Thin exception types mapped to HTTP status in {@code GlobalExceptionHandler}. */
public final class CartExceptions {

    private CartExceptions() {
    }

    /** No X-User-Id header — the gateway should have injected it; direct callers must supply it. */
    public static class UnauthorizedException extends RuntimeException {
        public UnauthorizedException(String message) {
            super(message);
        }
    }

    /** The product being added does not exist in the catalog. */
    public static class ProductNotFoundException extends RuntimeException {
        public ProductNotFoundException(String message) {
            super(message);
        }
    }

    /** Catalog-service could not be reached to snapshot the product — caller should retry. */
    public static class CatalogUnavailableException extends RuntimeException {
        public CatalogUnavailableException(String message) {
            super(message);
        }
    }

    /** The product is a pre-launch "coming soon" item (honey) and is not purchasable yet. */
    public static class HoneyNotBuyableException extends RuntimeException {
        public HoneyNotBuyableException(String message) {
            super(message);
        }
    }
}
