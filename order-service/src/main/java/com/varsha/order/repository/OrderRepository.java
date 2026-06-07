package com.varsha.order.repository;

import com.varsha.order.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {
    Optional<Order> findByOrderId(String orderId);
    Optional<Order> findByIdempotencyKey(String idempotencyKey);
    List<Order> findByUserIdOrderByIdDesc(String userId);
}
