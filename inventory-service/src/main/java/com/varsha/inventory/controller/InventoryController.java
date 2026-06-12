package com.varsha.inventory.controller;

import com.varsha.inventory.dto.Dtos.AdjustStockRequest;
import com.varsha.inventory.dto.Dtos.AtpReserveRequest;
import com.varsha.inventory.dto.Dtos.AtpReserveResponse;
import com.varsha.inventory.dto.Dtos.ReservationResponse;
import com.varsha.inventory.dto.Dtos.ReserveRequest;
import com.varsha.inventory.dto.Dtos.StockListItem;
import com.varsha.inventory.dto.Dtos.StockResponse;
import com.varsha.inventory.service.AtpService;
import com.varsha.inventory.service.AtpService.AtpReserveOutcome;
import com.varsha.inventory.service.InventoryService;
import java.util.List;
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
    private final AtpService atp;

    public InventoryController(InventoryService inventory, AtpService atp) {
        this.inventory = inventory;
        this.atp = atp;
    }

    @GetMapping("/stock/{sku}")
    public StockResponse stock(@PathVariable String sku) {
        return StockResponse.from(inventory.getStock(sku));
    }

    /** Admin: list every SKU's available/reserved stock for the inventory visibility page. */
    @GetMapping("/admin/stock")
    public List<StockListItem> listStock() {
        return inventory.listAllStock().stream().map(StockListItem::from).toList();
    }

    @PostMapping("/admin/stock")
    public StockResponse addStock(@Valid @RequestBody AdjustStockRequest req) {
        return StockResponse.from(inventory.addStock(req.sku(), req.quantity()));
    }

    /**
     * Synchronous available-to-promise pre-check at checkout. Internal call from order-service (not
     * under {@code /admin}, so the in-network order→inventory call needs no ADMIN header). Always
     * 200; the body's {@code result} tells the caller to proceed (RESERVED/DEGRADED) or reject 409
     * (INSUFFICIENT). The durable DB lock in {@code reserve()} remains the real oversell guard.
     */
    @PostMapping("/atp/reserve")
    public AtpReserveResponse atpReserve(@Valid @RequestBody AtpReserveRequest req) {
        AtpReserveOutcome outcome = atp.reserve(req.lines());
        return new AtpReserveResponse(outcome.result(), outcome.shortSku());
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
