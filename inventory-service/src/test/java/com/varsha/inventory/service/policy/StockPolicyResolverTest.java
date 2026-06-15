package com.varsha.inventory.service.policy;

import com.varsha.inventory.model.StockPolicy;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link StockPolicyResolver} — proves startup-time completeness guard
 * and correct per-policy dispatch.
 */
class StockPolicyResolverTest {

    @Test
    void allPoliciesRegistered_noExceptionAtConstruction() {
        // All four strategies registered -> resolver constructs cleanly.
        StockPolicyResolver resolver = resolverWithAllStrategies();
        assertThat(resolver).isNotNull();
    }

    @Test
    void get_FINITE_returnsFiniteStrategy() {
        StockPolicyResolver resolver = resolverWithAllStrategies();
        assertThat(resolver.get(StockPolicy.FINITE)).isInstanceOf(FiniteStrategy.class);
    }

    @Test
    void get_COMING_SOON_returnsComingSoonStrategy() {
        StockPolicyResolver resolver = resolverWithAllStrategies();
        assertThat(resolver.get(StockPolicy.COMING_SOON)).isInstanceOf(ComingSoonStrategy.class);
    }

    @Test
    void get_INFINITE_returnsInfiniteStrategy() {
        StockPolicyResolver resolver = resolverWithAllStrategies();
        assertThat(resolver.get(StockPolicy.INFINITE)).isInstanceOf(InfiniteStrategy.class);
    }

    @Test
    void get_BACKORDER_returnsBackorderStrategy() {
        StockPolicyResolver resolver = resolverWithAllStrategies();
        assertThat(resolver.get(StockPolicy.BACKORDER)).isInstanceOf(BackorderStrategy.class);
    }

    @Test
    void missingStrategy_throwsAtConstruction() {
        // Only three of four strategies — resolver must fail fast, not silently.
        assertThatThrownBy(() -> new StockPolicyResolver(List.of(
                new FiniteStrategy(),
                new ComingSoonStrategy(),
                new InfiniteStrategy()
                // BackorderStrategy missing
        ))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("StockPolicy.BACKORDER");
    }

    // --- helper ---

    private StockPolicyResolver resolverWithAllStrategies() {
        return new StockPolicyResolver(List.of(
                new FiniteStrategy(),
                new ComingSoonStrategy(),
                new InfiniteStrategy(),
                new BackorderStrategy()
        ));
    }
}
