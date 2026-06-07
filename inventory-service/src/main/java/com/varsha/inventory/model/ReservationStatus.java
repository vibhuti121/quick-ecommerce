package com.varsha.inventory.model;

public enum ReservationStatus {
    /** Stock moved from available → reserved, awaiting the outcome of the order. */
    HELD,
    /** Sale completed — reserved stock consumed. Terminal. */
    COMMITTED,
    /** Order failed/cancelled — reserved stock returned to available. Terminal. */
    RELEASED
}
