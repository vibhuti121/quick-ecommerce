package com.varsha.order.client;

import com.varsha.order.client.ClientExceptions.BusinessRejectionException;
import com.varsha.order.client.ClientExceptions.ServiceUnavailableException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.util.List;

/**
 * Calls inventory-service for the saga's hold/commit/release steps. Distinguishes BUSINESS
 * rejections (4xx — terminal, fail the order) from TRANSIENT failures (5xx/timeout — retry).
 * All three operations are idempotent on orderId, so re-running a saga step is safe.
 */
@Component
public class InventoryClient {

    private final RestClient http;

    public InventoryClient(RestClient inventoryRestClient) {
        this.http = inventoryRestClient;
    }

    public record Line(String sku, int qty) {}

    private record ReserveBody(String orderId, List<Line> lines) {}

    private record AtpBody(List<Line> lines) {}

    /**
     * Outcome of the synchronous ATP pre-check at checkout. {@code result} is one of
     * {@code RESERVED} / {@code INSUFFICIENT} / {@code DEGRADED}; {@code shortSku} is set only when
     * INSUFFICIENT. On any transport/5xx failure we synthesize {@code DEGRADED} so checkout proceeds
     * onto the durable DB-lock guard — the ATP layer never blocks a sale on its own outage.
     */
    public record AtpOutcome(String result, String shortSku) {
        public boolean insufficient() {
            return "INSUFFICIENT".equals(result);
        }
    }

    /**
     * Instant oversell pre-check before an order is created. Returns the inventory verdict; never
     * throws — Redis down, inventory down, or a timeout all degrade to {@code DEGRADED} so the
     * async saga's DB pessimistic lock stays the authoritative oversell guard.
     */
    public AtpOutcome atpReserve(List<Line> lines) {
        try {
            AtpOutcome body = http.post().uri("/api/inventory/atp/reserve")
                    .body(new AtpBody(lines))
                    .retrieve()
                    .body(AtpOutcome.class);
            return body != null ? body : new AtpOutcome("DEGRADED", null);
        } catch (RuntimeException e) {
            // 4xx/5xx/timeout/connection-refused — degrade, never block checkout on the early-reject layer.
            return new AtpOutcome("DEGRADED", null);
        }
    }

    public void reserve(String orderId, List<Line> lines) {
        post("/api/inventory/reservations", new ReserveBody(orderId, lines), "reserve");
    }

    public void commit(String orderId) {
        post("/api/inventory/reservations/" + orderId + "/commit", null, "commit");
    }

    public void release(String orderId) {
        post("/api/inventory/reservations/" + orderId + "/release", null, "release");
    }

    private void post(String uri, Object body, String op) {
        try {
            RestClient.RequestBodySpec spec = http.post().uri(uri);
            if (body != null) {
                spec.body(body);
            }
            spec.retrieve()
                    .onStatus(s -> s.is4xxClientError(), (req, res) -> {
                        throw new BusinessRejectionException(
                                "inventory " + op + " rejected: HTTP " + res.getStatusCode());
                    })
                    .onStatus(s -> s.is5xxServerError(), (req, res) -> {
                        throw new ServiceUnavailableException(
                                "inventory " + op + " failed: HTTP " + res.getStatusCode());
                    })
                    .toBodilessEntity();
        } catch (ResourceAccessException e) {
            throw new ServiceUnavailableException("inventory " + op + " unreachable: " + e.getMessage());
        }
    }
}
