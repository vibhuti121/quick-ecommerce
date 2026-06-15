package com.varsha.inventory.service;

import com.varsha.inventory.dto.Dtos.AtpResult;
import com.varsha.inventory.dto.Dtos.Line;
import com.varsha.inventory.model.StockItem;
import com.varsha.inventory.model.StockPolicy;
import com.varsha.inventory.repository.StockItemRepository;
import com.varsha.inventory.service.policy.ReservationStrategy;
import com.varsha.inventory.service.policy.StockPolicyResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Redis available-to-promise (ATP) layer — the <em>fast, early</em> oversell reject at checkout.
 *
 * <p>Each SKU has a counter {@code atp:{sku}} mirroring its sellable {@code availableQty}. A single
 * atomic Lua script checks <em>all</em> requested lines and decrements them all-or-nothing in one
 * round-trip, so two concurrent checkouts for the last unit cannot both pass. This is an early
 * reject only: the DB {@code PESSIMISTIC_WRITE} lock in {@link InventoryService#reserve} stays the
 * durable, authoritative oversell guard. If Redis is unreachable or a counter is missing, the
 * pre-check <em>degrades</em> (returns {@link AtpResult#DEGRADED}) and we let the DB guard decide —
 * never a false reject of a real sale, never a 500 into the checkout path.
 *
 * <p>The counters are kept in sync with the durable ledger by {@link InventoryService}: restock
 * (+N) and saga {@code release} both credit ATP back; {@code reserve}/{@code commit} need no ATP
 * write because checkout already decremented. Drift self-heals from the DB on startup via
 * {@code AtpBackfillRunner}.
 *
 * <p><b>Phase A stock-policy filtering:</b> before running the Lua script we classify each SKU by
 * its {@link StockPolicy}. COMING_SOON lines short-circuit to INSUFFICIENT immediately (never run
 * Lua). INFINITE/BACKORDER lines are dropped from Lua input (always promised). Only FINITE lines
 * are fed to the Lua script. The Lua itself is unchanged.
 */
@Service
public class AtpService {

    private static final Logger log = LoggerFactory.getLogger(AtpService.class);

    static final String KEY_PREFIX = "atp:";

    /**
     * Atomic multi-SKU check-and-decrement. KEYS = atp counters, ARGV = requested quantities
     * (parallel arrays). Returns a single Long:
     * <ul>
     *   <li>{@code 0}  — all lines had enough; all counters decremented (RESERVED)</li>
     *   <li>{@code i>0} — line {@code i} (1-based) was short; <em>nothing</em> decremented (INSUFFICIENT)</li>
     *   <li>{@code -1} — a counter was missing; nothing decremented, caller should degrade (DEGRADED)</li>
     * </ul>
     * A missing key means our mirror is incomplete (e.g. post-flush, pre-backfill); we degrade
     * rather than false-reject, deferring to the DB guard.
     */
    private static final RedisScript<Long> RESERVE_SCRIPT = new DefaultRedisScript<>(
            """
            for i = 1, #KEYS do
              local cur = redis.call('GET', KEYS[i])
              if cur == false then
                return -1
              end
              if tonumber(cur) < tonumber(ARGV[i]) then
                return i
              end
            end
            for i = 1, #KEYS do
              redis.call('DECRBY', KEYS[i], ARGV[i])
            end
            return 0
            """,
            Long.class);

    private final StringRedisTemplate redis;
    private final StockItemRepository stockItemRepository;
    private final StockPolicyResolver resolver;

    public AtpService(StringRedisTemplate redis,
                      StockItemRepository stockItemRepository,
                      StockPolicyResolver resolver) {
        this.redis = redis;
        this.stockItemRepository = stockItemRepository;
        this.resolver = resolver;
    }

    public static String key(String sku) {
        return KEY_PREFIX + sku;
    }

    /**
     * Early oversell check for a set of order lines. All-or-nothing and race-free. Never throws:
     * any Redis failure is logged and reported as {@link AtpResult#DEGRADED} so checkout proceeds
     * onto the durable DB guard.
     *
     * <p>Policy pre-pass (Phase A seam):
     * <ol>
     *   <li>COMING_SOON SKUs short-circuit to INSUFFICIENT immediately — Lua never runs.</li>
     *   <li>INFINITE/BACKORDER SKUs are dropped from Lua input — always considered available.</li>
     *   <li>Only FINITE SKUs are fed to the existing Lua script (unchanged).</li>
     *   <li>If all lines are non-FINITE (nothing for Lua), returns RESERVED directly.</li>
     * </ol>
     * In Phase A every SKU is FINITE (V3 defaults all rows), so this is a pass-through with
     * one extra batched non-locking DB read per call — harmless and self-documented.
     */
    public AtpReserveOutcome reserve(List<Line> lines) {
        // Collapse duplicate SKUs first — otherwise the Lua check phase would test each line
        // against the full counter independently while the decrement phase subtracts cumulatively,
        // which could oversell a SKU that appears twice. Mirrors reserve()'s TreeMap merge.
        Map<String, Integer> wanted = new TreeMap<>();
        for (Line l : lines) {
            wanted.merge(l.sku(), l.qty(), Integer::sum);
        }

        // --- Phase A: policy pre-pass ---
        // One batched non-locking read to classify all SKUs by policy.
        Map<String, StockPolicy> policyMap = loadPolicies(wanted.keySet());

        // Check for any COMING_SOON lines first — short-circuit the whole call to INSUFFICIENT.
        for (Map.Entry<String, Integer> e : wanted.entrySet()) {
            StockPolicy p = policyOf(e.getKey(), policyMap);
            if (p == StockPolicy.COMING_SOON) {
                return new AtpReserveOutcome(AtpResult.INSUFFICIENT, e.getKey());
            }
        }

        // Build the FINITE-only input lists for Lua (INFINITE/BACKORDER are dropped — always promised).
        List<String> keys = new ArrayList<>(wanted.size());
        List<String> args = new ArrayList<>(wanted.size());
        List<String> skus = new ArrayList<>(wanted.size());
        for (Map.Entry<String, Integer> e : wanted.entrySet()) {
            StockPolicy p = policyOf(e.getKey(), policyMap);
            ReservationStrategy strat = resolver.get(p);
            if (strat.participatesInAtp()) {
                keys.add(key(e.getKey()));
                args.add(String.valueOf(e.getValue()));
                skus.add(e.getKey());
            }
        }

        // If nothing for Lua (all INFINITE/BACKORDER), the whole set is always promised.
        if (keys.isEmpty()) {
            return new AtpReserveOutcome(AtpResult.RESERVED, null);
        }

        // --- existing Lua execution (unchanged) ---
        try {
            Long result = redis.execute(RESERVE_SCRIPT, keys, args.toArray());
            if (result == null) {
                return new AtpReserveOutcome(AtpResult.DEGRADED, null);
            }
            if (result == 0L) {
                return new AtpReserveOutcome(AtpResult.RESERVED, null);
            }
            if (result == -1L) {
                return new AtpReserveOutcome(AtpResult.DEGRADED, null);
            }
            // 1-based index within the FINITE-filtered skus list — still maps to the correct SKU.
            String shortSku = skus.get((int) (result - 1));
            return new AtpReserveOutcome(AtpResult.INSUFFICIENT, shortSku);
        } catch (RuntimeException ex) {
            // Redis down / timeout / script error — degrade to the DB guard, never block checkout.
            log.warn("atp.reserve.degraded redis unavailable, deferring to DB guard: {}", ex.toString());
            return new AtpReserveOutcome(AtpResult.DEGRADED, null);
        }
    }

    /**
     * Credit {@code qty} units back to a SKU's ATP counter (restock +N, or saga release of a
     * failed order). Best-effort: a Redis failure is logged and swallowed — the DB stays the
     * source of truth and the counter self-heals on the next restart backfill.
     */
    public void credit(String sku, int qty) {
        if (qty <= 0) {
            return;
        }
        try {
            redis.opsForValue().increment(key(sku), qty);
        } catch (RuntimeException ex) {
            log.warn("atp.credit.failed sku={} qty={} (ledger unaffected, heals on backfill): {}",
                    sku, qty, ex.toString());
        }
    }

    /** Result of an ATP reserve: the outcome and, when INSUFFICIENT, the first short SKU. */
    public record AtpReserveOutcome(AtpResult result, String shortSku) {
    }

    // --- helpers ---

    /**
     * Batch-load policies for a set of SKUs. Returns a map from sku -> policy. SKUs not found in
     * the DB (no stock row yet) are absent from the map; callers default to FINITE via
     * {@link #policyOf}.
     */
    private Map<String, StockPolicy> loadPolicies(Iterable<String> skuSet) {
        List<String> skuList = new ArrayList<>();
        skuSet.forEach(skuList::add);
        List<StockItem> rows = stockItemRepository.findAllBySkuIn(skuList);
        return rows.stream()
                .collect(Collectors.toMap(StockItem::getSku, StockItem::getStockPolicy));
    }

    /**
     * Returns the policy for a SKU from the pre-loaded map, defaulting to FINITE if the row
     * is absent. A missing row means the stock row has not been created yet; FINITE is the
     * safe default (the DB guard in reserve() will 404 it anyway, which is the correct error
     * for a truly unknown SKU).
     */
    private StockPolicy policyOf(String sku, Map<String, StockPolicy> policyMap) {
        return policyMap.getOrDefault(sku, StockPolicy.FINITE);
    }
}
