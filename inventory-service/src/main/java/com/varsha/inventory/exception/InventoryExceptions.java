package com.varsha.inventory.exception;

public final class InventoryExceptions {

    private InventoryExceptions() {
    }

    /** SKU / reservation not found. */
    public static class NotFoundException extends RuntimeException {
        public NotFoundException(String message) {
            super(message);
        }
    }

    /** Not enough available stock to satisfy a reservation (all-or-nothing). */
    public static class InsufficientStockException extends RuntimeException {
        public InsufficientStockException(String message) {
            super(message);
        }
    }

    /** Illegal state transition, e.g. release after commit. */
    public static class ConflictException extends RuntimeException {
        public ConflictException(String message) {
            super(message);
        }
    }
}
