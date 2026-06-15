package com.varsha.inventory.service.policy;

import com.varsha.inventory.model.StockItem;
import com.varsha.inventory.model.StockPolicy;
import org.springframework.stereotype.Component;

/**
 * BACKORDER policy stub: sell beyond on-hand, allow available_qty to go negative, skip ATP.
 *
 * <p>Phase A seam only — NOT a shipped feature. The V1 CHECK (available_qty >= 0) still
 * applies; any attempt to drive available_qty negative will fail at the DB constraint (see
 * §6.2 of the design doc). That is the intended safeguard until a real made-to-order SKU
 * exists and its own migration relaxes the constraint. The strategy is wired so the enum
 * dispatch compiles; no live SKU is BACKORDER in Phase A.
 */
@Component
public class BackorderStrategy implements ReservationStrategy {

    @Override
    public StockPolicy policy() {
        return StockPolicy.BACKORDER;
    }

    @Override
    public boolean requiresDbLock() {
        return true; // still touches the ledger row (decrement can go negative)
    }

    @Override
    public boolean participatesInAtp() {
        return false; // skip ATP; always allowed even if counter is zero
    }

    @Override
    public boolean movesReservedOnCommit() {
        return true; // mirrors FINITE: reserved_qty drains on commit/release
    }

    @Override
    public StockDelta evaluateReserve(String sku, int qty, StockItem lockedRowOrNull) {
        // No availability gate — backorder always succeeds regardless of on-hand stock.
        // NOTE: available_qty will go negative; the V1 CHECK will enforce a DB error until
        // Phase C ships the constraint change. This is documented and intentional (§6.2).
        return new StockDelta(sku, -qty, qty);
    }
}
