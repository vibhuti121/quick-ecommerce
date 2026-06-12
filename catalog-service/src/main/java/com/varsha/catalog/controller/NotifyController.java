package com.varsha.catalog.controller;

import com.varsha.catalog.dto.NotifyCountResponse;
import com.varsha.catalog.dto.NotifyRequest;
import com.varsha.catalog.dto.NotifyResponse;
import com.varsha.catalog.service.NotifyService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

/**
 * Launch-interest ("🔔 Notify me") signups.
 * <ul>
 *   <li>{@code POST /api/catalog/notify} — PUBLIC. Added to the gateway PUBLIC_PATHS so anonymous
 *       shoppers can sign up. Idempotent on (topic, phone).</li>
 *   <li>{@code GET /api/catalog/notify/count?topic=…} — PUBLIC (read-only). Sits under the same
 *       {@code /api/catalog/notify} prefix the gateway already opens, and returns only an aggregate
 *       count + the topic (no PII). Internal/admin use today; not surfaced to customers.</li>
 *   <li>{@code GET /api/catalog/admin/notify} — ADMIN. Sits under the {@code /api/catalog/admin}
 *       prefix, so it's gated by both the gateway RBAC boundary and the in-service
 *       {@code AdminRoleFilter} (X-User-Role=ADMIN) — same as the admin product endpoints.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/catalog")
public class NotifyController {

    private final NotifyService notify;

    public NotifyController(NotifyService notify) {
        this.notify = notify;
    }

    @PostMapping("/notify")
    public ResponseEntity<NotifyResponse> signup(@Valid @RequestBody NotifyRequest req) {
        NotifyResponse body = notify.save(req);
        return ResponseEntity.created(URI.create("/api/catalog/notify/" + body.id())).body(body);
    }

    @GetMapping("/notify/count")
    public NotifyCountResponse count(@RequestParam String topic) {
        return new NotifyCountResponse(topic, notify.countByTopic(topic));
    }

    @GetMapping("/admin/notify")
    public List<NotifyResponse> list() {
        return notify.list();
    }
}
