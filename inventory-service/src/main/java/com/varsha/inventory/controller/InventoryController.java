package com.varsha.inventory.controller;

import com.varsha.inventory.dto.Dtos.AdjustStockRequest;
import com.varsha.inventory.dto.Dtos.ReservationResponse;
import com.varsha.inventory.dto.Dtos.ReserveRequest;
import com.varsha.inventory.dto.Dtos.StockResponse;
import com.varsha.inventory.service.InventoryService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Inventory API. The reservation endpoints are the saga's hooks: order-service's poller
 * calls reserve → (payment) → commit, or release on failure. All three are idempotent.
 */
@RestController
@RequestMapping("/api/inventory")
public class InventoryController {

    private final InventoryService inventory;

    public InventoryController(InventoryService inventory) {
        this.inventory = inventory;
    }

    @GetMapping("/stock/{sku}")
    public StockResponse stock(@PathVariable String sku) {
        return StockResponse.from(inventory.getStock(sku));
    }

    @PostMapping("/admin/stock")
    public StockResponse addStock(@Valid @RequestBody AdjustStockRequest req) {
        return StockResponse.from(inventory.addStock(req.sku(), req.quantity()));
    }

    @PostMapping("/reservations")
    public ReservationResponse reserve(@Valid @RequestBody ReserveRequest req) {
        return inventory.reserve(req);
    }

    @PostMapping("/reservations/{orderId}/commit")
    public ReservationResponse commit(@PathVariable String orderId) {
        return inventory.commit(orderId);
    }

    @PostMapping("/reservations/{orderId}/release")
    public ReservationResponse release(@PathVariable String orderId) {
        return inventory.release(orderId);
    }
}
