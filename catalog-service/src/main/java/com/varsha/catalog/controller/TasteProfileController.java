package com.varsha.catalog.controller;

import com.varsha.catalog.dto.TasteMergeRequest;
import com.varsha.catalog.dto.TasteProfileResponse;
import com.varsha.catalog.dto.TasteProgressUpdate;
import com.varsha.catalog.service.TasteProfileService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Taste Match account profile (V7). The conversion layer's server seam — the account-side mirror of the
 * game's per-device progression so a player's XP / passport / badges / streak / persona + demand
 * footprint survive across devices once they sign in.
 *
 * <ul>
 *   <li>{@code GET  /api/catalog/taste/profile}        — the account's profile (zeroed default if none).</li>
 *   <li>{@code POST /api/catalog/taste/profile}        — upsert a run's progress (monotonic merge).</li>
 *   <li>{@code POST /api/catalog/taste/profile/merge}  — fold a device snapshot in on login.</li>
 * </ul>
 *
 * <p>All three are AUTHENTICATED: the gateway validates the JWT and forwards the principal as the
 * gateway-owned {@code X-User-Id} header (it strips any client-sent copy, so it can't be spoofed). A
 * "guest-" id is rejected with 403 — this is a non-guest claim surface (the FE only calls these after a
 * real sign-in), separate from the guest-allowed browse/cart and from the checkout login gate.
 */
@RestController
@RequestMapping("/api/catalog/taste")
public class TasteProfileController {

    private final TasteProfileService service;

    public TasteProfileController(TasteProfileService service) {
        this.service = service;
    }

    @GetMapping("/profile")
    public ResponseEntity<TasteProfileResponse> get(@RequestHeader(value = "X-User-Id", required = false) String userId) {
        if (isGuest(userId)) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(service.get(userId));
    }

    @PostMapping("/profile")
    public ResponseEntity<TasteProfileResponse> upsert(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody(required = false) TasteProgressUpdate body) {
        if (isGuest(userId)) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(service.upsert(userId, body));
    }

    @PostMapping("/profile/merge")
    public ResponseEntity<TasteProfileResponse> merge(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody(required = false) TasteMergeRequest body) {
        if (isGuest(userId)) return ResponseEntity.status(403).build();
        TasteProgressUpdate device = body != null ? body.deviceProgress() : null;
        return ResponseEntity.ok(service.merge(userId, device));
    }

    /** A missing/blank id, or a guest token's "guest-" subject, is NOT a claimable account. */
    private static boolean isGuest(String userId) {
        return userId == null || userId.isBlank() || userId.startsWith("guest-");
    }
}
