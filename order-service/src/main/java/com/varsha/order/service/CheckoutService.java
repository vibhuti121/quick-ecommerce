package com.varsha.order.service;

import com.varsha.order.dto.Dtos.CheckoutItem;
import com.varsha.order.dto.Dtos.CheckoutRequest;
import com.varsha.order.dto.Dtos.OrderResponse;
import com.varsha.order.exception.OrderExceptions.NotFoundException;
import com.varsha.order.model.Order;
import com.varsha.order.model.OrderItem;
import com.varsha.order.model.OrderStatus;
import com.varsha.order.model.OutboxEvent;
import com.varsha.order.model.OutboxStatus;
import com.varsha.order.repository.OrderRepository;
import com.varsha.order.repository.OutboxRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class CheckoutService {

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
}
