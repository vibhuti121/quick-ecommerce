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
import jakarta.validation.constraints.Pattern;

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
            @NotBlank @Pattern(regexp = "^\\d{6}$", message = "must be a 6-digit pincode") String pincode,
            @NotBlank String city,
            @NotBlank String state,
            @NotEmpty @Valid List<CheckoutItem> items
    ) {}

    public record OrderItemResponse(Long productId, String sku, String name,
                                    BigDecimal unitPrice, int quantity, BigDecimal lineTotal) {}

    /**
     * Co-purchase pair for the recommendations pillar: {@code productId} appeared in
     * {@code count} distinct CONFIRMED orders alongside the anchor product. Consumed
     * service-to-service by catalog-service, which blends it with content-based hits.
     */
    public record CoPurchaseResponse(Long productId, long count) {}

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
            String pincode,
            String city,
            String state,
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
                    o.getCustomerName(), o.getCustomerPhone(), o.getDeliveryAddress(),
                    o.getPincode(), o.getCity(), o.getState(), o.getDeliveryStatus(),
                    items, o.getCreatedAt(), o.getUpdatedAt());
        }
    }
}
