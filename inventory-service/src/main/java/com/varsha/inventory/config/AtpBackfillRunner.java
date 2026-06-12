package com.varsha.inventory.config;

import com.varsha.inventory.model.StockItem;
import com.varsha.inventory.service.AtpService;
import com.varsha.inventory.service.InventoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Seeds the Redis available-to-promise counters {@code atp:{sku} = availableQty} from the durable DB
 * ledger on every startup. This is the drift-recovery path: whatever the counters were (stale,
 * flushed, never-set), startup reconciles them to the authoritative {@code availableQty}. Mirrors
 * catalog-service's OpenSearch startup backfill.
 *
 * <p>Best-effort: if Redis is unreachable the service still boots (the ATP pre-check degrades to the
 * DB guard); we log and move on rather than crash-loop.
 */
@Component
public class AtpBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AtpBackfillRunner.class);

    private final InventoryService inventory;
    private final StringRedisTemplate redis;

    public AtpBackfillRunner(InventoryService inventory, StringRedisTemplate redis) {
        this.inventory = inventory;
        this.redis = redis;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            List<StockItem> all = inventory.listAllStock();
            for (StockItem s : all) {
                redis.opsForValue().set(AtpService.key(s.getSku()), String.valueOf(s.getAvailableQty()));
            }
            log.info("atp.backfill.complete seeded {} ATP counters from DB", all.size());
        } catch (RuntimeException ex) {
            // Redis down at boot — service still serves; ATP pre-check will degrade to the DB guard
            // and counters reconcile on the next restart.
            log.warn("atp.backfill.skipped redis unavailable at startup, ATP will degrade: {}", ex.toString());
        }
    }
}
