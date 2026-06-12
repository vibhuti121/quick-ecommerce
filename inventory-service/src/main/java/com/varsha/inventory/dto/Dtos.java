package com.varsha.inventory.dto;

import com.varsha.inventory.model.Reservation;
import com.varsha.inventory.model.ReservationStatus;
import com.varsha.inventory.model.StockItem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
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

    /**
     * Admin stock-list row (adds {@code updatedAt} over {@link StockResponse}). A separate record so
     * the reservation paths' {@code StockResponse} contract stays frozen.
     */
    public record StockListItem(String sku, int availableQty, int reservedQty, Instant updatedAt) {
        public static StockListItem from(StockItem s) {
            return new StockListItem(s.getSku(), s.getAvailableQty(), s.getReservedQty(), s.getUpdatedAt());
        }
    }

    /**
     * Synchronous available-to-promise pre-check at checkout (no orderId — the order does not exist
     * yet). All-or-nothing across {@code lines}.
     */
    public record AtpReserveRequest(@NotEmpty @Valid List<Line> lines) {}

    /** Outcome of an ATP pre-check. Always returned with HTTP 200; the caller maps the result. */
    public enum AtpResult {
        /** All lines had stock and were decremented — checkout may proceed. */
        RESERVED,
        /** A line was short — checkout should reject with 409. {@code shortSku} names the SKU. */
        INSUFFICIENT,
        /** Redis unavailable or counter missing — checkout proceeds; the DB lock is the real guard. */
        DEGRADED
    }

    /** ATP pre-check response. {@code shortSku} is set only when {@code result == INSUFFICIENT}. */
    public record AtpReserveResponse(AtpResult result, String shortSku) {}

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
