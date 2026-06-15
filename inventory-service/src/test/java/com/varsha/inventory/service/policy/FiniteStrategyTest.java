package com.varsha.inventory.service.policy;

import com.varsha.inventory.exception.InventoryExceptions.InsufficientStockException;
import com.varsha.inventory.model.StockItem;
import com.varsha.inventory.model.StockPolicy;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link FiniteStrategy} — regression-locks Phase A's byte-for-byte
 * identical behaviour to pre-V3 (§7 of the stock-policy design doc).
 */
class FiniteStrategyTest {

    private final FiniteStrategy strategy = new FiniteStrategy();

    @Test
    void policy_is_FINITE() {
        assertThat(strategy.policy()).isEqualTo(StockPolicy.FINITE);
    }

    @Test
    void requiresDbLock_is_true() {
        assertThat(strategy.requiresDbLock()).isTrue();
    }

    @Test
    void participatesInAtp_is_true() {
        assertThat(strategy.participatesInAtp()).isTrue();
    }

    @Test
    void movesReservedOnCommit_is_true() {
        assertThat(strategy.movesReservedOnCommit()).isTrue();
    }

    @Test
    void evaluateReserve_sufficientStock_returnsDelta() {
        StockItem item = stockItem(10);
        ReservationStrategy.StockDelta delta = strategy.evaluateReserve("SKU-A", 3, item);
        assertThat(delta.sku()).isEqualTo("SKU-A");
        assertThat(delta.availableDelta()).isEqualTo(-3);
        assertThat(delta.reservedDelta()).isEqualTo(3);
        // Strategy must NOT mutate the row — the caller applies the delta
        assertThat(item.getAvailableQty()).isEqualTo(10);
    }

    @Test
    void evaluateReserve_exactStock_passes() {
        StockItem item = stockItem(5);
        ReservationStrategy.StockDelta delta = strategy.evaluateReserve("SKU-B", 5, item);
        assertThat(delta.availableDelta()).isEqualTo(-5);
    }

    @Test
    void evaluateReserve_insufficientStock_throws409() {
        StockItem item = stockItem(2);
        assertThatThrownBy(() -> strategy.evaluateReserve("SKU-C", 3, item))
                .isInstanceOf(InsufficientStockException.class)
                .hasMessageContaining("SKU-C")
                .hasMessageContaining("requested 3")
                .hasMessageContaining("available 2");
    }

    @Test
    void evaluateReserve_zeroStock_throws409() {
        StockItem item = stockItem(0);
        assertThatThrownBy(() -> strategy.evaluateReserve("SKU-D", 1, item))
                .isInstanceOf(InsufficientStockException.class);
    }

    @Test
    void evaluateReserve_nullLockedRow_throwsIllegalState() {
        // Callers must always pass the locked row for FINITE — null is a programming error.
        assertThatThrownBy(() -> strategy.evaluateReserve("SKU-E", 1, null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FINITE strategy requires a locked row");
    }

    // --- helpers ---

    private StockItem stockItem(int availableQty) {
        StockItem item = new StockItem();
        item.setSku("test-sku");
        item.setAvailableQty(availableQty);
        item.setReservedQty(0);
        item.setStockPolicy(StockPolicy.FINITE);
        return item;
    }
}
