package com.varsha.inventory.service.policy;

import com.varsha.inventory.model.StockItem;
import com.varsha.inventory.model.StockPolicy;
import org.springframework.stereotype.Component;

/**
 * INFINITE policy stub: digital/ebook — always succeed, no lock, skip ATP.
 *
 * <p>Phase A seam only — no live SKU is INFINITE in Phase A (all rows are FINITE by
 * default). Wired so the dispatch compiles. Phase C will attach real digital SKUs.
 * The CHECK constraint still forbids avail<0 (BACKORDER concern, not this policy).
 */
@Component
public class InfiniteStrategy implements ReservationStrategy {

    @Override
    public StockPolicy policy() {
        return StockPolicy.INFINITE;
    }

    @Override
    public boolean requiresDbLock() {
        return false;
    }

    @Override
    public boolean participatesInAtp() {
        return false; // always promised; dropped from Lua input
    }

    @Override
    public boolean movesReservedOnCommit() {
        return false; // no stock moved on reserve; commit/release are no-ops
    }

    @Override
    public StockDelta evaluateReserve(String sku, int qty, StockItem lockedRowOrNull) {
        // Always succeeds — unlimited supply. Zero stock deltas.
        return new StockDelta(sku, 0, 0);
    }
}
