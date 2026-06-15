package com.varsha.inventory.service.policy;

import com.varsha.inventory.exception.InventoryExceptions.InsufficientStockException;
import com.varsha.inventory.exception.InventoryExceptions.NotFoundException;
import com.varsha.inventory.model.StockPolicy;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link ComingSoonStrategy} — proves the seam's clean 409 (not 404) behaviour
 * and that commit/release paths don't touch stock (Phase A §7, COMING_SOON relevant paths).
 */
class ComingSoonStrategyTest {

    private final ComingSoonStrategy strategy = new ComingSoonStrategy();

    @Test
    void policy_is_COMING_SOON() {
        assertThat(strategy.policy()).isEqualTo(StockPolicy.COMING_SOON);
    }

    @Test
    void doesNotRequireDbLock() {
        assertThat(strategy.requiresDbLock()).isFalse();
    }

    @Test
    void doesNotParticipateInAtp() {
        assertThat(strategy.participatesInAtp()).isFalse();
    }

    @Test
    void doesNotMoveReservedOnCommit() {
        assertThat(strategy.movesReservedOnCommit()).isFalse();
    }

    @Test
    void evaluateReserve_alwaysThrows_InsufficientStock_notNotFoundException() {
        // Must be InsufficientStockException (409), NOT NotFoundException (404).
        // The whole point of COMING_SOON is "exists but not sellable yet".
        assertThatThrownBy(() -> strategy.evaluateReserve("MAL-HONEY-COORG-500", 1, null))
                .isInstanceOf(InsufficientStockException.class)
                .isNotInstanceOf(NotFoundException.class)
                .hasMessageContaining("COMING_SOON");
    }

    @Test
    void evaluateReserve_anyQty_stillThrows() {
        assertThatThrownBy(() -> strategy.evaluateReserve("SKU-HONEY", 100, null))
                .isInstanceOf(InsufficientStockException.class);
    }
}
