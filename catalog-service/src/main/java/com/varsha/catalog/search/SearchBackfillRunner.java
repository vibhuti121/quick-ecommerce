package com.varsha.catalog.search;

import com.varsha.catalog.dto.ProductResponse;
import com.varsha.catalog.service.ProductReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

/**
 * Rebuilds the OpenSearch index from Postgres on startup. This is the load-bearing, BUILD-GATE-BLIND
 * piece: the V2/V3 Flyway-seeded products (MaLLADE honey, fruits) are written straight to the DB and
 * NEVER pass through {@code CatalogService}'s write path, so without this backfill the search index is
 * empty for everything except rows created at runtime. Only a real {@code compose up} proves it works
 * — hence the explicit "indexed N products" log line and the smoke assertion that {@code q=honey}
 * returns a seeded SKU.
 *
 * <p>Resilience: the whole body is best-effort. A brief readiness wait covers OpenSearch booting a
 * little behind catalog (compose uses {@code service_started}, not {@code service_healthy}); if it
 * never comes up, we log a warning and let the service start anyway — search degrades to the Postgres
 * fallback rather than crash-looping catalog.
 */
@Component
public class SearchBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SearchBackfillRunner.class);
    private static final int PAGE_SIZE = 200;

    private final ProductSearchService search;
    private final ProductReader reader;
    private final long readinessTimeoutMs;

    public SearchBackfillRunner(ProductSearchService search, ProductReader reader,
                                @Value("${app.search.backfill.readiness-timeout-ms:30000}") long readinessTimeoutMs) {
        this.search = search;
        this.reader = reader;
        this.readinessTimeoutMs = readinessTimeoutMs;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!search.isEnabled()) {
            log.info("search disabled (app.search.enabled=false) — skipping backfill");
            return;
        }
        try {
            if (!awaitReady()) {
                log.warn("search backfill: OpenSearch not ready within {}ms — skipping; search will "
                        + "use the Postgres fallback until the index is populated", readinessTimeoutMs);
                return;
            }
            search.ensureIndex();

            int indexed = 0;
            int page = 0;
            Page<ProductResponse> batch;
            do {
                batch = reader.findAllForIndex(PageRequest.of(page, PAGE_SIZE));
                indexed += search.bulkIndex(batch.getContent());
                page++;
            } while (batch.hasNext());

            log.info("search backfill: indexed {} products into the search index", indexed);
        } catch (Exception e) {
            // Never let a backfill problem stop the service from coming up.
            log.warn("search backfill failed; catalog stays up and search falls back to Postgres: {}",
                    e.toString());
        }
    }

    /** Poll OpenSearch until it answers a ping or the timeout elapses. */
    private boolean awaitReady() throws InterruptedException {
        long deadline = System.nanoTime() + readinessTimeoutMs * 1_000_000L;
        while (System.nanoTime() < deadline) {
            if (search.ping()) {
                return true;
            }
            Thread.sleep(2000);
        }
        return search.ping();
    }
}
