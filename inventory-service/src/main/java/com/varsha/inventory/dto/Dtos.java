package com.varsha.inventory.dto;

import com.varsha.inventory.model.Reservation;
import com.varsha.inventory.model.ReservationStatus;
import com.varsha.inventory.model.StockItem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/** Request/response payloads for inventory operations. */
public final class Dtos {

    private Dtos() {
    }

    public record Line(@NotBlank String sku, @Min(1) int qty) {}

    public record ReserveRequest(
            @NotBlank String orderId,
            @NotEmpty @Valid List<Line> lines
    ) {}

    public record AdjustStockRequest(
            @NotBlank String sku,
            @NotNull @Min(1) Integer quantity
    ) {}

    public record StockResponse(String sku, int availableQty, int reservedQty) {
        public static StockResponse from(StockItem s) {
            return new StockResponse(s.getSku(), s.getAvailableQty(), s.getReservedQty());
        }
    }

    public record ReservationResponse(String orderId, ReservationStatus status, List<Line> lines) {
        public static ReservationResponse from(Reservation r) {
            return new ReservationResponse(
                    r.getOrderId(),
                    r.getStatus(),
                    r.getLines().stream().map(l -> new Line(l.getSku(), l.getQty())).toList()
            );
        }
    }
}
