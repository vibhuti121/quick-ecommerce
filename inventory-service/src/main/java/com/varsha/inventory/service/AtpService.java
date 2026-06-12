package com.varsha.inventory.service;

import com.varsha.inventory.dto.Dtos.AtpResult;
import com.varsha.inventory.dto.Dtos.Line;
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

    public AtpService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public static String key(String sku) {
        return KEY_PREFIX + sku;
    }

    /**
     * Early oversell check for a set of order lines. All-or-nothing and race-free. Never throws:
     * any Redis failure is logged and reported as {@link AtpResult#DEGRADED} so checkout proceeds
     * onto the durable DB guard.
     */
    public AtpReserveOutcome reserve(List<Line> lines) {
        // Collapse duplicate SKUs first — otherwise the Lua check phase would test each line against
        // the full counter independently while the decrement phase subtracts cumulatively, which
        // could oversell a SKU that appears twice. Mirrors reserve()'s TreeMap merge.
        Map<String, Integer> wanted = new TreeMap<>();
        for (Line l : lines) {
            wanted.merge(l.sku(), l.qty(), Integer::sum);
        }

        List<String> keys = new ArrayList<>(wanted.size());
        List<String> args = new ArrayList<>(wanted.size());
        List<String> skus = new ArrayList<>(wanted.size());
        for (Map.Entry<String, Integer> e : wanted.entrySet()) {
            keys.add(key(e.getKey()));
            args.add(String.valueOf(e.getValue()));
            skus.add(e.getKey());
        }

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
            // 1-based index of the short line → the short SKU.
            String shortSku = skus.get((int) (result - 1));
            return new AtpReserveOutcome(AtpResult.INSUFFICIENT, shortSku);
        } catch (RuntimeException ex) {
            // Redis down / timeout / script error — degrade to the DB guard, never block checkout.
            log.warn("atp.reserve.degraded redis unavailable, deferring to DB guard: {}", ex.toString());
            return new AtpReserveOutcome(AtpResult.DEGRADED, null);
        }
    }

    /**
     * Credit {@code qty} units back to a SKU's ATP counter (restock +N, or saga release of a failed
     * order). Best-effort: a Redis failure is logged and swallowed — the DB stays the source of
     * truth and the counter self-heals on the next restart backfill.
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
}
