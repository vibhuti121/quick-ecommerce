package com.varsha.inventory.service;

import com.varsha.inventory.dto.Dtos.Line;
import com.varsha.inventory.dto.Dtos.ReservationResponse;
import com.varsha.inventory.dto.Dtos.ReserveRequest;
import com.varsha.inventory.exception.InventoryExceptions.ConflictException;
import com.varsha.inventory.exception.InventoryExceptions.NotFoundException;
import com.varsha.inventory.model.Reservation;
import com.varsha.inventory.model.ReservationLine;
import com.varsha.inventory.model.ReservationStatus;
import com.varsha.inventory.model.StockItem;
import com.varsha.inventory.model.StockPolicy;
import com.varsha.inventory.repository.ReservationRepository;
import com.varsha.inventory.repository.StockItemRepository;
import com.varsha.inventory.service.policy.ReservationStrategy;
import com.varsha.inventory.service.policy.ReservationStrategy.StockDelta;
import com.varsha.inventory.service.policy.StockPolicyResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import static net.logstash.logback.argument.StructuredArguments.kv;

@Service
public class InventoryService {

    private static final Logger log = LoggerFactory.getLogger(InventoryService.class);

    private final StockItemRepository stock;
    private final ReservationRepository reservations;
    private final AtpService atp;
    private final StockPolicyResolver resolver;

    public InventoryService(StockItemRepository stock,
                            ReservationRepository reservations,
                            AtpService atp,
                            StockPolicyResolver resolver) {
        this.stock = stock;
        this.reservations = reservations;
        this.atp = atp;
        this.resolver = resolver;
    }

    @Transactional(readOnly = true)
    public StockItem getStock(String sku) {
        return stock.findBySku(sku)
                .orElseThrow(() -> new NotFoundException("No stock record for SKU: " + sku));
    }

    /** Admin: every stock row, sorted by SKU, for the inventory visibility page. */
    @Transactional(readOnly = true)
    public List<StockItem> listAllStock() {
        return stock.findAll(Sort.by(Sort.Order.asc("sku")));
    }

    /** Admin: add {@code quantity} units of available stock, creating the row if needed. */
    @Transactional
    public StockItem addStock(String sku, int quantity) {
        StockItem item = stock.findBySkuForUpdate(sku).orElse(null);
        if (item == null) {
            item = new StockItem();
            item.setSku(sku);
            item.setAvailableQty(0);
            item.setReservedQty(0);
            // stockPolicy defaults to FINITE on the Java side (StockItem field default)
        }
        item.setAvailableQty(item.getAvailableQty() + quantity);
        StockItem saved = stock.save(item);
        // Mirror the +N onto the Redis ATP counter so the new stock is instantly sellable at checkout.
        // Best-effort: a Redis failure is swallowed; the DB row above is the source of truth and the
        // counter self-heals on the next restart backfill.
        atp.credit(sku, quantity);
        // Admin audit trail — trace.id + hashed user_id ride along from MDC; no PII (sku + quantities).
        log.info("admin.stock.adjusted {}", sku,
                kv("event", "admin.stock.adjusted"),
                kv("payload", Map.of(
                        "sku", sku,
                        "addedQty", quantity,
                        "availableQty", saved.getAvailableQty())));
        return saved;
    }

    /**
     * HOLD stock for an order. Idempotent on {@code orderId}: a repeat call returns the existing
     * reservation without moving stock again. All-or-nothing — if any line lacks stock (or is
     * COMING_SOON), nothing is reserved. SKUs are locked in sorted order to avoid deadlocks.
     *
     * <p><b>Phase A dispatch (stock-policy seam):</b> per SKU, we read the policy off a
     * non-locking prefetch, then delegate to the matching {@link ReservationStrategy}. FINITE
     * is the only active policy in Phase A; all other strategies exist as compile-time stubs.
     * The two-pass design (non-locking prefetch, then locking only for FINITE/BACKORDER) keeps
     * the lock scope minimal and the sorted-order deadlock guarantee intact (§6.5 of design doc).
     */
    @Transactional
    public ReservationResponse reserve(ReserveRequest req) {
        Reservation existing = reservations.findByOrderId(req.orderId()).orElse(null);
        if (existing != null) {
            return ReservationResponse.from(existing); // idempotent replay
        }

        // Collapse duplicate SKUs, then iterate in sorted (lock) order.
        Map<String, Integer> wanted = new TreeMap<>();
        for (Line l : req.lines()) {
            wanted.merge(l.sku(), l.qty(), Integer::sum);
        }

        // Non-locking prefetch to read policies for all SKUs in one query.
        // We do this BEFORE the locking pass so we know which rows need locks.
        Map<String, StockPolicy> policyMap = loadPolicies(wanted.keySet());

        // Lock rows in sorted order (same TreeMap iteration) — only for lock-requiring policies.
        // Non-lock policies (COMING_SOON, INFINITE) either throw or skip; they take no lock.
        for (Map.Entry<String, Integer> e : wanted.entrySet()) {
            String sku = e.getKey();
            int qty = e.getValue();
            StockPolicy policy = policyOf(sku, policyMap);
            ReservationStrategy strat = resolver.get(policy);

            if (strat.requiresDbLock()) {
                StockItem locked = stock.findBySkuForUpdate(sku)
                        .orElseThrow(() -> new NotFoundException("No stock record for SKU: " + sku));
                // Evaluate while we have the lock — throws InsufficientStockException for 409.
                StockDelta delta = strat.evaluateReserve(sku, qty, locked);
                if (delta.availableDelta() != 0 || delta.reservedDelta() != 0) {
                    locked.setAvailableQty(locked.getAvailableQty() + delta.availableDelta());
                    locked.setReservedQty(locked.getReservedQty() + delta.reservedDelta());
                }
            } else {
                // No lock needed — still evaluate (may throw for COMING_SOON).
                strat.evaluateReserve(sku, qty, null);
                // If evaluateReserve didn't throw, the line is accepted (INFINITE: no-op delta).
            }
        }

        // All checks passed — record the reservation with all lines regardless of policy.
        Reservation res = new Reservation();
        res.setOrderId(req.orderId());
        res.setStatus(ReservationStatus.HELD);
        for (Map.Entry<String, Integer> e : wanted.entrySet()) {
            res.getLines().add(new ReservationLine(e.getKey(), e.getValue()));
        }
        return ReservationResponse.from(reservations.save(res));
    }

    /** COMMIT a held reservation: consume the reserved stock. Idempotent if already committed. */
    @Transactional
    public ReservationResponse commit(String orderId) {
        Reservation res = reservations.findByOrderId(orderId)
                .orElseThrow(() -> new NotFoundException("No reservation for order: " + orderId));
        if (res.getStatus() == ReservationStatus.COMMITTED) {
            return ReservationResponse.from(res);
        }
        if (res.getStatus() == ReservationStatus.RELEASED) {
            throw new ConflictException("Reservation already released, cannot commit: " + orderId);
        }
        // Load all line policies in one query.
        List<String> lineSkus = res.getLines().stream().map(ReservationLine::getSku).toList();
        Map<String, StockPolicy> policyMap = loadPolicies(lineSkus);
        for (ReservationLine l : res.getLines()) {
            StockPolicy policy = policyOf(l.getSku(), policyMap);
            ReservationStrategy strat = resolver.get(policy);
            if (strat.movesReservedOnCommit()) {
                StockItem item = lockOrThrow(l.getSku());
                // Drain reserved. Belt-and-braces: never go below zero (§6.4 mid-flight edge).
                item.setReservedQty(Math.max(0, item.getReservedQty() - l.getQty()));
            }
            // COMING_SOON / INFINITE: no-op (reserved was never bumped)
        }
        res.setStatus(ReservationStatus.COMMITTED);
        res.setUpdatedAt(Instant.now());
        return ReservationResponse.from(reservations.save(res));
    }

    /** RELEASE a held reservation: return reserved stock to available. Idempotent if already released. */
    @Transactional
    public ReservationResponse release(String orderId) {
        Reservation res = reservations.findByOrderId(orderId)
                .orElseThrow(() -> new NotFoundException("No reservation for order: " + orderId));
        if (res.getStatus() == ReservationStatus.RELEASED) {
            return ReservationResponse.from(res);
        }
        if (res.getStatus() == ReservationStatus.COMMITTED) {
            throw new ConflictException("Reservation already committed, cannot release: " + orderId);
        }
        // Load all line policies in one query.
        List<String> lineSkus = res.getLines().stream().map(ReservationLine::getSku).toList();
        Map<String, StockPolicy> policyMap = loadPolicies(lineSkus);
        for (ReservationLine l : res.getLines()) {
            StockPolicy policy = policyOf(l.getSku(), policyMap);
            ReservationStrategy strat = resolver.get(policy);
            if (strat.movesReservedOnCommit()) {
                StockItem item = lockOrThrow(l.getSku());
                item.setAvailableQty(item.getAvailableQty() + l.getQty());
                // Belt-and-braces: never go below zero (§6.4 mid-flight edge).
                item.setReservedQty(Math.max(0, item.getReservedQty() - l.getQty()));
                // The order failed/cancelled — give the units back to ATP that checkout decremented,
                // so they become sellable again. Best-effort; the DB row above is authoritative.
                // Only ledger policies credit ATP; non-ledger policies (COMING_SOON/INFINITE) never
                // debited a counter, so crediting would wrongly inflate it.
                atp.credit(l.getSku(), l.getQty());
            }
            // COMING_SOON / INFINITE: no stock move, no atp.credit
        }
        res.setStatus(ReservationStatus.RELEASED);
        res.setUpdatedAt(Instant.now());
        return ReservationResponse.from(reservations.save(res));
    }

    private StockItem lockOrThrow(String sku) {
        return stock.findBySkuForUpdate(sku)
                .orElseThrow(() -> new NotFoundException("No stock record for SKU: " + sku));
    }

    /**
     * Batch non-locking read to classify a set of SKUs by policy. Returns a map sku -> policy.
     * Absent SKUs (no stock row) default to FINITE in {@link #policyOf} — a missing row will 404
     * when reserve() attempts the actual lock, which is the correct error for a truly unknown SKU.
     */
    private Map<String, StockPolicy> loadPolicies(Iterable<String> skuIterable) {
        List<String> skuList = new ArrayList<>();
        skuIterable.forEach(skuList::add);
        List<StockItem> rows = stock.findAllBySkuIn(skuList);
        Map<String, StockPolicy> map = new LinkedHashMap<>();
        for (StockItem s : rows) {
            map.put(s.getSku(), s.getStockPolicy());
        }
        return map;
    }

    private StockPolicy policyOf(String sku, Map<String, StockPolicy> policyMap) {
        return policyMap.getOrDefault(sku, StockPolicy.FINITE);
    }
}
