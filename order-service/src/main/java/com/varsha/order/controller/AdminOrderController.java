package com.varsha.order.controller;

import com.varsha.order.dto.Dtos.OrderResponse;
import com.varsha.order.model.DeliveryStatus;
import com.varsha.order.model.OrderStatus;
import com.varsha.order.service.CheckoutService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Admin order operations for the COD pilot, mounted at {@code /admin/orders/**} — deliberately OUTSIDE
 * the {@code /api/orders/**} prefix the gateway routes. The gateway has no {@code /admin/**} route and
 * order-service publishes no host port, so these endpoints are unreachable from the public internet;
 * they are reached only from inside the docker network (the isolated admin app's nginx). The
 * {@link com.varsha.order.config.AdminRoleFilter} additionally requires {@code X-User-Role=ADMIN} as
 * defense-in-depth.
 */
@RestController
@RequestMapping("/admin/orders")
public class AdminOrderController {

    private final CheckoutService checkout;

    public AdminOrderController(CheckoutService checkout) {
        this.checkout = checkout;
    }

    @GetMapping
    public List<OrderResponse> list(
            @RequestParam(value = "status", required = false) OrderStatus status,
            @RequestParam(value = "deliveryStatus", required = false) DeliveryStatus deliveryStatus) {
        return checkout.listForAdmin(status, deliveryStatus);
    }

    @PostMapping("/{orderId}/mark-delivered")
    public OrderResponse markDelivered(@PathVariable String orderId) {
        return checkout.markDelivered(orderId);
    }
}
