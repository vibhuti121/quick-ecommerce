package com.varsha.order.repository;

import com.varsha.order.model.DeliveryStatus;
import com.varsha.order.model.Order;
import com.varsha.order.model.OrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {
    Optional<Order> findByOrderId(String orderId);
    Optional<Order> findByIdempotencyKey(String idempotencyKey);
    List<Order> findByUserIdOrderByIdDesc(String userId);

    // Admin views (newest-first), used by the network-isolated admin platform.
    List<Order> findAllByOrderByIdDesc();
    List<Order> findByStatusOrderByIdDesc(OrderStatus status);
    List<Order> findByDeliveryStatusOrderByIdDesc(DeliveryStatus deliveryStatus);
}
