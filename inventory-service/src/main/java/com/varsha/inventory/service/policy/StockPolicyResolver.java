package com.varsha.inventory.service.policy;

import com.varsha.inventory.model.StockPolicy;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Resolves a {@link StockPolicy} to its {@link ReservationStrategy} implementation.
 * Built from all strategy beans injected by Spring — adding a new policy only requires
 * adding a new {@code @Component} implementing {@link ReservationStrategy}.
 *
 * <p>Any policy value missing from the map is a programming error (enum + strategy out of
 * sync) and fails fast at dispatch rather than silently defaulting.
 */
@Component
public class StockPolicyResolver {

    private final Map<StockPolicy, ReservationStrategy> strategies;

    public StockPolicyResolver(List<ReservationStrategy> strategyBeans) {
        strategies = new EnumMap<>(StockPolicy.class);
        for (ReservationStrategy s : strategyBeans) {
            strategies.put(s.policy(), s);
        }
        // Fail fast at startup if any enum value lacks a strategy
        for (StockPolicy p : StockPolicy.values()) {
            if (!strategies.containsKey(p)) {
                throw new IllegalStateException(
                        "No ReservationStrategy bean registered for StockPolicy." + p
                                + " — add a @Component implementing ReservationStrategy for it");
            }
        }
    }

    /**
     * Returns the strategy for the given policy. Never null; throws if the policy is not
     * in the registry (programming error — the constructor guard above should have caught it
     * at startup, but this protects against runtime enum extension).
     */
    public ReservationStrategy get(StockPolicy policy) {
        ReservationStrategy s = strategies.get(policy);
        if (s == null) {
            throw new IllegalStateException(
                    "No ReservationStrategy registered for StockPolicy." + policy);
        }
        return s;
    }
}
