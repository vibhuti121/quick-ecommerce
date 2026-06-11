package com.varsha.order.service;

import com.varsha.order.dto.Dtos.CheckoutItem;
import com.varsha.order.dto.Dtos.CheckoutRequest;
import com.varsha.order.dto.Dtos.OrderResponse;
import com.varsha.order.exception.OrderExceptions.NotFoundException;
import com.varsha.order.model.DeliveryStatus;
import com.varsha.order.model.Order;
import com.varsha.order.model.OrderItem;
import com.varsha.order.model.OrderStatus;
import com.varsha.order.model.OutboxEvent;
import com.varsha.order.model.OutboxStatus;
import com.varsha.order.repository.OrderRepository;
import com.varsha.order.repository.OutboxRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static net.logstash.logback.argument.StructuredArguments.kv;

@Service
public class CheckoutService {

    // Structured audit log (observability Pillar 2B): a typed `event` + `payload` per order lifecycle step.
    // These lines are the durable dispute trail routed to the cold/1-year log tier and are queried by
    // trace.id / hashed user_id (MDC) / orderId. PII rule: payloads carry money + ids ONLY — never the
    // customer name/phone/address held on the Order, and never any card data.
    private static final Logger log = LoggerFactory.getLogger(CheckoutService.class);

    private final OrderRepository orders;
    private final OutboxRepository outbox;

    public CheckoutService(OrderRepository orders, OutboxRepository outbox) {
        this.orders = orders;
        this.outbox = outbox;
    }

    /**
     * Place an order. Idempotent on the client's Idempotency-Key: a retry returns the original order
     * instead of creating/charging again. The order row and its outbox "OrderPlaced" event are
     * written in ONE transaction — so an order can never exist without its saga trigger. The saga
     * itself (reserve/pay/commit) runs asynchronously off the outbox.
     */
    @Transactional
    public OrderResponse checkout(String userId, String idempotencyKey, CheckoutRequest req) {
        Order existing = orders.findByIdempotencyKey(idempotencyKey).orElse(null);
        if (existing != null) {
            return OrderResponse.from(existing); // idempotent replay
        }

        String orderId = UUID.randomUUID().toString();
        Order order = new Order();
        order.setOrderId(orderId);
        order.setUserId(userId);
        order.setIdempotencyKey(idempotencyKey);
        order.setStatus(OrderStatus.PENDING);
        order.setCurrency(req.currency());
        order.setCustomerName(req.customerName());
        order.setCustomerPhone(req.customerPhone());
        order.setDeliveryAddress(req.deliveryAddress());
        order.setDeliveryStatus(DeliveryStatus.AWAITING_DELIVERY);

        BigDecimal total = BigDecimal.ZERO;
        for (CheckoutItem i : req.items()) {
            order.getItems().add(new OrderItem(i.productId(), i.sku(), i.name(), i.unitPrice(), i.quantity()));
            total = total.add(i.unitPrice().multiply(BigDecimal.valueOf(i.quantity())));
        }
        order.setTotalAmount(total);
        orders.save(order);

        OutboxEvent event = new OutboxEvent();
        event.setAggregateId(orderId);
        event.setEventType("OrderPlaced");
        event.setPayload(Map.of(
                "orderId", orderId,
                "userId", userId,
                "amount", total.toPlainString(),
                "currency", req.currency()));
        event.setStatus(OutboxStatus.PENDING);
        event.setAttempts(0);
        outbox.save(event);

        log.info("order.placed {}", orderId,
                kv("event", "order.placed"),
                kv("payload", Map.of(
                        "orderId", orderId,
                        "amount", total.toPlainString(),
                        "currency", req.currency(),
                        "itemCount", req.items().size())));

        return OrderResponse.from(order);
    }

    @Transactional(readOnly = true)
    public OrderResponse getByOrderId(String orderId) {
        return orders.findByOrderId(orderId)
                .map(OrderResponse::from)
                .orElseThrow(() -> new NotFoundException("No order: " + orderId));
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> listForUser(String userId) {
        return orders.findByUserIdOrderByIdDesc(userId).stream()
                .map(OrderResponse::from)
                .toList();
    }

    /**
     * Admin view (newest-first), optionally filtered by saga status or delivery status. Used by the
     * network-isolated admin platform to triage which COD orders are ready to hand over.
     */
    @Transactional(readOnly = true)
    public List<OrderResponse> listForAdmin(OrderStatus status, DeliveryStatus deliveryStatus) {
        List<Order> rows;
        if (status != null) {
            rows = orders.findByStatusOrderByIdDesc(status);
        } else if (deliveryStatus != null) {
            rows = orders.findByDeliveryStatusOrderByIdDesc(deliveryStatus);
        } else {
            rows = orders.findAllByOrderByIdDesc();
        }
        return rows.stream().map(OrderResponse::from).toList();
    }

    /**
     * Founder marks a COD order delivered after handing the goods over (and collecting cash). Only an
     * orthogonal fulfillment flip — it does NOT touch the saga {@link OrderStatus}. Idempotent: a repeat
     * call on an already-DELIVERED order is a no-op and returns the current state.
     */
    @Transactional
    public OrderResponse markDelivered(String orderId) {
        Order order = orders.findByOrderId(orderId)
                .orElseThrow(() -> new NotFoundException("No order: " + orderId));
        if (order.getDeliveryStatus() != DeliveryStatus.DELIVERED) {
            order.setDeliveryStatus(DeliveryStatus.DELIVERED);
            orders.save(order);
        }
        return OrderResponse.from(order);
    }
}
