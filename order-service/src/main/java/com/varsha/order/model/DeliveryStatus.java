package com.varsha.order.model;

/**
 * Fulfillment state of an order, orthogonal to {@link OrderStatus}. For the COD pilot the saga
 * confirms an order (payment is a no-op) while the goods are still to be hand-delivered, so we track
 * delivery separately: every order starts AWAITING_DELIVERY and the founder flips it to DELIVERED via
 * the admin action once handed over. CANCELLED is reserved for a future admin cancel action.
 */
public enum DeliveryStatus {
    /** Order confirmed; goods not yet handed to the customer. Initial state. */
    AWAITING_DELIVERY,
    /** Goods delivered (and, for COD, cash collected) by the founder. Terminal. */
    DELIVERED,
    /** Reserved for a future admin cancel action; not set by any flow yet. */
    CANCELLED
}
