package com.varsha.inventory.service.policy;

import com.varsha.inventory.exception.InventoryExceptions.InsufficientStockException;
import com.varsha.inventory.model.StockItem;
import com.varsha.inventory.model.StockPolicy;
import org.springframework.stereotype.Component;

/**
 * COMING_SOON policy: defence-in-depth gate behind the cart-service category check.
 * reserve() always 409s with InsufficientStockException — clean, not 404. ATP is
 * short-circuited to INSUFFICIENT before Lua runs. commit/release are no-ops
 * (reserved was never bumped).
 *
 * <p>Phase A: no live SKU is COMING_SOON (all rows are FINITE by default). This
 * strategy is wired so the dispatch compiles; it becomes live in Phase B when honey
 * rows are seeded COMING_SOON by the V3 migration extension.
 */
@Component
public class ComingSoonStrategy implements ReservationStrategy {

    @Override
    public StockPolicy policy() {
        return StockPolicy.COMING_SOON;
    }

    @Override
    public boolean requiresDbLock() {
        return false;
    }

    @Override
    public boolean participatesInAtp() {
        return false; // ATP pre-pass short-circuits to INSUFFICIENT for COMING_SOON
    }

    @Override
    public boolean movesReservedOnCommit() {
        return false; // never bumped reserved, so nothing to drain on commit/release
    }

    @Override
    public StockDelta evaluateReserve(String sku, int qty, StockItem lockedRowOrNull) {
        // Always reject — the SKU exists but is not yet sellable.
        throw new InsufficientStockException(
                "SKU " + sku + " is not yet available for purchase (COMING_SOON)");
    }
}
