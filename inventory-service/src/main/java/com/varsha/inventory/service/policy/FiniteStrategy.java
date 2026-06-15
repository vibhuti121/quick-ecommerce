package com.varsha.inventory.service.policy;

import com.varsha.inventory.exception.InventoryExceptions.InsufficientStockException;
import com.varsha.inventory.model.StockItem;
import com.varsha.inventory.model.StockPolicy;
import org.springframework.stereotype.Component;

/**
 * FINITE policy: the current (pre-V3) behaviour exactly.
 * Lock the row, check avail >= qty else 409, decrement available and bump reserved.
 * Real ATP participation — checkout's fast-path pre-check applies.
 */
@Component
public class FiniteStrategy implements ReservationStrategy {

    @Override
    public StockPolicy policy() {
        return StockPolicy.FINITE;
    }

    @Override
    public boolean requiresDbLock() {
        return true;
    }

    @Override
    public boolean participatesInAtp() {
        return true;
    }

    @Override
    public boolean movesReservedOnCommit() {
        return true;
    }

    @Override
    public StockDelta evaluateReserve(String sku, int qty, StockItem lockedRowOrNull) {
        if (lockedRowOrNull == null) {
            // Should not happen — callers always provide the locked row for FINITE
            throw new IllegalStateException("FINITE strategy requires a locked row for SKU: " + sku);
        }
        if (lockedRowOrNull.getAvailableQty() < qty) {
            throw new InsufficientStockException(
                    "Insufficient stock for SKU " + sku
                            + ": requested " + qty + ", available " + lockedRowOrNull.getAvailableQty());
        }
        return new StockDelta(sku, -qty, qty);
    }
}
