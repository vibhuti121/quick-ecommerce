package com.varsha.inventory.service.policy;

import com.varsha.inventory.model.StockItem;
import com.varsha.inventory.model.StockPolicy;

/**
 * Per-policy reservation behaviour. Pure decision + in-memory mutation of an already-locked
 * StockItem; NO Redis, NO persistence, NO catalog call. Orchestration (locking order, save, ATP)
 * stays in InventoryService/AtpService so there is exactly one writer and one transaction boundary.
 */
public interface ReservationStrategy {

    StockPolicy policy();

    /** True if this policy needs the authoritative DB row lock + availability gate (only FINITE/BACKORDER do). */
    boolean requiresDbLock();

    /** True if this policy participates in the Redis ATP pre-check (only FINITE does). */
    boolean participatesInAtp();

    /**
     * True if this policy moves reserved_qty when a saga commits or releases. False for policies
     * that never bumped reserved (COMING_SOON, INFINITE).
     */
    boolean movesReservedOnCommit();

    /**
     * Decide a single line against an already-locked stock row (or null when
     * {@link #requiresDbLock()} is false and no row was locked). Throws
     * InsufficientStockException for a clean 409; returns the stock-qty delta to apply.
     * Does NOT mutate the row itself — the caller applies the delta in one place to keep the
     * write path auditable.
     *
     * @param sku            the SKU being reserved
     * @param qty            requested quantity
     * @param lockedRowOrNull the already-locked StockItem row, or null if no lock was taken
     * @return delta to apply: availableDelta (negative = decrement), reservedDelta
     */
    StockDelta evaluateReserve(String sku, int qty, StockItem lockedRowOrNull);

    /** (sku, availableDelta, reservedDelta) to apply on reserve; reservedDelta mirrors qty for
     *  ledger policies, 0 otherwise. */
    record StockDelta(String sku, int availableDelta, int reservedDelta) {}
}
