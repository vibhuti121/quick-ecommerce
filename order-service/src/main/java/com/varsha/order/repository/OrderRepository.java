package com.varsha.order.repository;

import com.varsha.order.model.DeliveryStatus;
import com.varsha.order.model.Order;
import com.varsha.order.model.OrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    /**
     * Co-purchase signal for recommendations: products that appeared in the same CONFIRMED order
     * as the anchor product, ranked by how many distinct orders paired them.
     *
     * <p>Self-join {@code order_items} on {@code order_id}; {@code oi2.product_id <> oi1.product_id}
     * excludes self-pairs so the anchor never recommends itself. {@code COUNT(DISTINCT o.id)} counts
     * each order once even if a product appears on multiple lines. Only {@code CONFIRMED} orders
     * count — PENDING/FAILED carts are not a purchase signal. Backed by {@code idx_order_items_product}
     * (V3) for the anchor lookup and {@code idx_order_items_order} (V1) for the join.
     */
    @Query(value = """
            SELECT oi2.product_id AS productId, COUNT(DISTINCT o.id) AS cnt
            FROM order_items oi1
            JOIN order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.product_id <> oi1.product_id
            JOIN orders o ON o.id = oi1.order_id
            WHERE oi1.product_id = :productId AND o.status = 'CONFIRMED'
            GROUP BY oi2.product_id
            ORDER BY cnt DESC, oi2.product_id ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<CoPurchaseRow> findCoPurchased(@Param("productId") Long productId, @Param("limit") int limit);

    /** Native-query projection: maps the {@code productId}/{@code cnt} column aliases above. */
    interface CoPurchaseRow {
        Long getProductId();
        long getCnt();
    }
}
