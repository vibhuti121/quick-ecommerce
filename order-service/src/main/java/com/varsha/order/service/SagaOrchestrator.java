package com.varsha.order.service;

import com.varsha.order.client.ClientExceptions.BusinessRejectionException;
import com.varsha.order.client.ClientExceptions.ServiceUnavailableException;
import com.varsha.order.client.InventoryClient;
import com.varsha.order.client.InventoryClient.Line;
import com.varsha.order.client.PaymentClient;
import com.varsha.order.model.Order;
import com.varsha.order.model.OrderItem;
import com.varsha.order.model.OrderStatus;
import com.varsha.order.model.OutboxEvent;
import com.varsha.order.model.OutboxStatus;
import com.varsha.order.repository.OrderRepository;
import com.varsha.order.repository.OutboxRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static net.logstash.logback.argument.StructuredArguments.kv;

/**
 * Drives one outbox event through the checkout saga:
 *   reserve inventory -> charge payment -> commit inventory (success) | release inventory (failure).
 *
 * Every downstream call is idempotent on orderId, so this whole method is safe to re-run after a
 * transient failure or a crash — that is what makes at-least-once outbox delivery correct here.
 *
 * Lives in its own bean (not the poller) so the {@code @Transactional} proxy actually applies when
 * the poller calls it.
 */
@Service
public class SagaOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(SagaOrchestrator.class);

    private final OutboxRepository outbox;
    private final OrderRepository orders;
    private final InventoryClient inventory;
    private final PaymentClient payment;
    private final int maxAttempts;

    public SagaOrchestrator(OutboxRepository outbox, OrderRepository orders,
                            InventoryClient inventory, PaymentClient payment,
                            @Value("${app.outbox.max-attempts}") int maxAttempts) {
        this.outbox = outbox;
        this.orders = orders;
        this.inventory = inventory;
        this.payment = payment;
        this.maxAttempts = maxAttempts;
    }

    @Transactional
    public void processOne(Long eventId) {
        OutboxEvent ev = outbox.findById(eventId).orElse(null);
        if (ev == null || ev.getStatus() != OutboxStatus.PENDING) {
            return; // already handled by another poll tick
        }
        Order order = orders.findByOrderId(ev.getAggregateId()).orElse(null);
        if (order == null) {
            log.error("Outbox {} references unknown order {}", eventId, ev.getAggregateId());
            ev.setStatus(OutboxStatus.FAILED);
            ev.setProcessedAt(Instant.now());
            return;
        }
        if (order.getStatus() != OrderStatus.PENDING) {
            // order already reached a terminal state — just close the event
            closeProcessed(ev);
            return;
        }

        ev.setAttempts(ev.getAttempts() + 1);
        String orderId = order.getOrderId();

        try {
            inventory.reserve(orderId, reserveLines(order));
            boolean paid = payment.charge(orderId, order.getTotalAmount(), order.getCurrency());
            if (paid) {
                inventory.commit(orderId);
                order.setStatus(OrderStatus.CONFIRMED);
                log.info("Order {} CONFIRMED", orderId,
                        kv("event", "order.confirmed"), kv("payload", lifecycle(order, null)));
            } else {
                inventory.release(orderId);
                order.setStatus(OrderStatus.FAILED);
                order.setFailureReason("Payment declined");
                log.info("Order {} FAILED: payment declined", orderId,
                        kv("event", "order.payment_declined"), kv("payload", lifecycle(order, "Payment declined")));
            }
            closeProcessed(ev);

        } catch (BusinessRejectionException e) {
            // Terminal: e.g. insufficient stock at reserve, or a downstream business rejection.
            // Best-effort release in case a hold was placed before a later step rejected (idempotent;
            // a no-op / harmless 4xx if nothing was held).
            safeRelease(orderId);
            order.setStatus(OrderStatus.FAILED);
            order.setFailureReason(e.getMessage());
            log.info("Order {} FAILED: {}", orderId, e.getMessage(),
                    kv("event", "order.rejected"), kv("payload", lifecycle(order, e.getMessage())));
            closeProcessed(ev);

        } catch (ServiceUnavailableException e) {
            // Transient: leave the event PENDING so the next poll retries — UNLESS we've exhausted
            // the retry budget, in which case force-fail the order and release any hold.
            if (ev.getAttempts() >= maxAttempts) {
                safeRelease(orderId);
                order.setStatus(OrderStatus.FAILED);
                order.setFailureReason("Saga exhausted retries: " + e.getMessage());
                ev.setStatus(OutboxStatus.FAILED);
                ev.setProcessedAt(Instant.now());
                log.error("Order {} FAILED after {} attempts: {}", orderId, ev.getAttempts(), e.getMessage(),
                        kv("event", "order.retries_exhausted"),
                        kv("payload", lifecycle(order, "Saga exhausted retries: " + e.getMessage())));
            } else {
                log.warn("Order {} saga attempt {} transient failure, will retry: {}",
                        orderId, ev.getAttempts(), e.getMessage());
                // ev stays PENDING; attempts increment is persisted by the tx commit
            }
        }
    }

    private void closeProcessed(OutboxEvent ev) {
        ev.setStatus(OutboxStatus.PROCESSED);
        ev.setProcessedAt(Instant.now());
    }

    /**
     * Audit payload for an order lifecycle event (observability Pillar 2B) — the durable dispute trail,
     * joined by orderId (this runs on the outbox-poller thread, off any servlet request, so the MDC
     * carries no hashed user_id/trace here; orderId is the join key). PII rule: money + ids + saga
     * status ONLY — never the customer name/phone/address on the Order, never card data.
     */
    private Map<String, Object> lifecycle(Order order, String reason) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("orderId", order.getOrderId());
        p.put("amount", order.getTotalAmount().toPlainString());
        p.put("currency", order.getCurrency());
        p.put("status", order.getStatus().name());
        if (reason != null) p.put("reason", reason);
        return p;
    }

    /** Collapse order items to (sku, total qty) reservation lines. */
    private List<Line> reserveLines(Order order) {
        Map<String, Integer> bySku = new LinkedHashMap<>();
        for (OrderItem item : order.getItems()) {
            bySku.merge(item.getSku(), item.getQuantity(), Integer::sum);
        }
        return bySku.entrySet().stream()
                .map(e -> new Line(e.getKey(), e.getValue()))
                .toList();
    }

    private void safeRelease(String orderId) {
        try {
            inventory.release(orderId);
        } catch (RuntimeException ignored) {
            // nothing to release, or already released — not fatal to the failure path
        }
    }
}
