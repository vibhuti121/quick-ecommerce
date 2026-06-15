package com.varsha.inventory.model;

/**
 * How a SKU is fulfilled — inventory's axis, orthogonal to catalog's category/GI ("what it is").
 * Persisted as the {@code stock_items.stock_policy} string (Flyway V3, CHECK-constrained). Default
 * FINITE preserves pre-V3 behaviour exactly. Unknown DB value -> fail fast on load (see note).
 */
public enum StockPolicy {
    /** Finite ledger: lock + decrement, all-or-nothing, real ATP. Fruit, honey post-launch. */
    FINITE,
    /** Exists but not sellable yet: reserve always 409 (clean, not 404), ATP INSUFFICIENT. Honey pre-launch. */
    COMING_SOON,
    /** Effectively unlimited: always succeed, no lock, skip ATP. Digital/ebook. */
    INFINITE,
    /** Sell beyond on-hand: always succeed, allow negative available, skip ATP. Future made-to-order. */
    BACKORDER
}
