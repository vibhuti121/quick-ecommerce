package com.varsha.inventory.service;

import com.varsha.inventory.dto.Dtos.Line;
import com.varsha.inventory.dto.Dtos.ReservationResponse;
import com.varsha.inventory.dto.Dtos.ReserveRequest;
import com.varsha.inventory.exception.InventoryExceptions.ConflictException;
import com.varsha.inventory.exception.InventoryExceptions.InsufficientStockException;
import com.varsha.inventory.exception.InventoryExceptions.NotFoundException;
import com.varsha.inventory.model.Reservation;
import com.varsha.inventory.model.ReservationLine;
import com.varsha.inventory.model.ReservationStatus;
import com.varsha.inventory.model.StockItem;
import com.varsha.inventory.repository.ReservationRepository;
import com.varsha.inventory.repository.StockItemRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

import static net.logstash.logback.argument.StructuredArguments.kv;

@Service
public class InventoryService {

    private static final Logger log = LoggerFactory.getLogger(InventoryService.class);

    private final StockItemRepository stock;
    private final ReservationRepository reservations;

    public InventoryService(StockItemRepository stock, ReservationRepository reservations) {
        this.stock = stock;
        this.reservations = reservations;
    }

    @Transactional(readOnly = true)
    public StockItem getStock(String sku) {
        return stock.findBySku(sku)
                .orElseThrow(() -> new NotFoundException("No stock record for SKU: " + sku));
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
        }
        item.setAvailableQty(item.getAvailableQty() + quantity);
        StockItem saved = stock.save(item);
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
     * reservation without moving stock again. All-or-nothing — if any line lacks stock, nothing
     * is reserved. SKUs are locked in sorted order to avoid deadlocks under concurrency.
     */
    @Transactional
    public ReservationResponse reserve(ReserveRequest req) {
        Reservation existing = reservations.findByOrderId(req.orderId()).orElse(null);
        if (existing != null) {
            return ReservationResponse.from(existing); // idempotent replay
        }

        // collapse duplicate SKUs, then iterate in sorted (lock) order
        Map<String, Integer> wanted = new TreeMap<>();
        for (Line l : req.lines()) {
            wanted.merge(l.sku(), l.qty(), Integer::sum);
        }

        Map<String, StockItem> locked = new LinkedHashMap<>();
        for (Map.Entry<String, Integer> e : wanted.entrySet()) {
            StockItem item = stock.findBySkuForUpdate(e.getKey())
                    .orElseThrow(() -> new NotFoundException("No stock record for SKU: " + e.getKey()));
            if (item.getAvailableQty() < e.getValue()) {
                throw new InsufficientStockException(
                        "Insufficient stock for SKU " + e.getKey()
                                + ": requested " + e.getValue() + ", available " + item.getAvailableQty());
            }
            locked.put(e.getKey(), item);
        }

        // all checks passed — apply the holds
        Reservation res = new Reservation();
        res.setOrderId(req.orderId());
        res.setStatus(ReservationStatus.HELD);
        for (Map.Entry<String, Integer> e : wanted.entrySet()) {
            StockItem item = locked.get(e.getKey());
            item.setAvailableQty(item.getAvailableQty() - e.getValue());
            item.setReservedQty(item.getReservedQty() + e.getValue());
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
        for (ReservationLine l : res.getLines()) {
            StockItem item = lockOrThrow(l.getSku());
            item.setReservedQty(item.getReservedQty() - l.getQty());
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
        for (ReservationLine l : res.getLines()) {
            StockItem item = lockOrThrow(l.getSku());
            item.setAvailableQty(item.getAvailableQty() + l.getQty());
            item.setReservedQty(item.getReservedQty() - l.getQty());
        }
        res.setStatus(ReservationStatus.RELEASED);
        res.setUpdatedAt(Instant.now());
        return ReservationResponse.from(reservations.save(res));
    }

    private StockItem lockOrThrow(String sku) {
        return stock.findBySkuForUpdate(sku)
                .orElseThrow(() -> new NotFoundException("No stock record for SKU: " + sku));
    }
}
