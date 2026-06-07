package com.varsha.order.model;

public enum OutboxStatus {
    /** Awaiting the poller. */
    PENDING,
    /** Saga ran to a terminal order state (CONFIRMED or FAILED). */
    PROCESSED,
    /** Exhausted retries; the order was force-failed. */
    FAILED
}
