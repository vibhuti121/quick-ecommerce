package com.varsha.order.dto;

import com.varsha.order.model.DeliveryStatus;
import com.varsha.order.model.Order;
import com.varsha.order.model.OrderStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Request/response payloads for order operations. */
public final class Dtos {

    private Dtos() {
    }

    public record CheckoutItem(
            @NotNull Long productId,
            @NotBlank String sku,
            @NotBlank String name,
            @NotNull @DecimalMin("0.00") BigDecimal unitPrice,
            @Min(1) int quantity
    ) {}

    public record CheckoutRequest(
            @NotBlank String currency,
            @NotBlank String customerName,
            @NotBlank String customerPhone,
            @NotBlank String deliveryAddress,
            @NotEmpty @Valid List<CheckoutItem> items
    ) {}

    public record OrderItemResponse(Long productId, String sku, String name,
                                    BigDecimal unitPrice, int quantity, BigDecimal lineTotal) {}

    public record OrderResponse(
            String orderId,
            String userId,
            OrderStatus status,
            BigDecimal totalAmount,
            String currency,
            String failureReason,
            String customerName,
            String customerPhone,
            String deliveryAddress,
            DeliveryStatus deliveryStatus,
            List<OrderItemResponse> items,
            Instant createdAt,
            Instant updatedAt
    ) {
        public static OrderResponse from(Order o) {
            List<OrderItemResponse> items = o.getItems().stream()
                    .map(i -> new OrderItemResponse(i.getProductId(), i.getSku(), i.getName(),
                            i.getUnitPrice(), i.getQuantity(), i.getLineTotal()))
                    .toList();
            return new OrderResponse(o.getOrderId(), o.getUserId(), o.getStatus(), o.getTotalAmount(),
                    o.getCurrency(), o.getFailureReason(),
                    o.getCustomerName(), o.getCustomerPhone(), o.getDeliveryAddress(), o.getDeliveryStatus(),
                    items, o.getCreatedAt(), o.getUpdatedAt());
        }
    }
}
