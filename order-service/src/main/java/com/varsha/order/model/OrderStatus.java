package com.varsha.order.model;

public enum OrderStatus {
    /** Created and persisted; the saga has not finished yet. */
    PENDING,
    /** Inventory committed and payment captured. */
    CONFIRMED,
    /** Inventory or payment failed; any hold was released. Terminal. */
    FAILED
}
