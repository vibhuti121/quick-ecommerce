package com.varsha.videocall.controller;

import com.varsha.videocall.dto.Dtos.EligibilityResponse;
import com.varsha.videocall.dto.Dtos.EligibilitySummary;
import com.varsha.videocall.dto.Dtos.GrantRequest;
import com.varsha.videocall.dto.Dtos.GrantResponse;
import com.varsha.videocall.exception.VideocallExceptions.ForbiddenException;
import com.varsha.videocall.exception.VideocallExceptions.UnauthorizedException;
import com.varsha.videocall.service.VideocallService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Videocall API. The gateway validates the login JWT once and injects X-User-Id / X-User-Email /
 * X-Display-Name (stripping any client-supplied copies — AuthFilter), so this service trusts those
 * headers as identity. All paths sit under /api/videocall, so the gateway requires login by default;
 * per-user gating (eligibility + cooldown + guest rejection) happens here.
 */
@RestController
@RequestMapping("/api/videocall")
public class VideocallController {

    private static final String USER_HEADER = "X-User-Id";
    private static final String EMAIL_HEADER = "X-User-Email";
    private static final String NAME_HEADER = "X-Display-Name";

    private final VideocallService service;

    public VideocallController(VideocallService service) {
        this.service = service;
    }

    /** Records Tally completion. Guests (or missing identity) are forbidden — only real, logged-in users. */
    @PostMapping("/eligibility")
    public ResponseEntity<EligibilityResponse> recordEligibility(
            @RequestHeader(value = USER_HEADER, required = false) String userId,
            @RequestHeader(value = EMAIL_HEADER, required = false) String email) {
        requireRealUser(userId);
        EligibilityResponse body = service.recordEligibility(userId, email);
        return ResponseEntity.status(body.created() ? HttpStatus.CREATED : HttpStatus.OK).body(body);
    }

    /**
     * The gate. A guest or missing identity gets the SAME neutral {available:false} as an ineligible or
     * cooled-down user — nothing leaks about why a call isn't available.
     */
    @PostMapping("/grant")
    public GrantResponse requestGrant(
            @RequestHeader(value = USER_HEADER, required = false) String userId,
            @RequestHeader(value = EMAIL_HEADER, required = false) String email,
            @RequestHeader(value = NAME_HEADER, required = false) String displayName,
            @RequestBody(required = false) GrantRequest body) {
        if (isGuestOrMissing(userId)) {
            return GrantResponse.unavailable();
        }
        return service.requestGrant(userId, email, displayName, body == null ? null : body.roomId());
    }

    /** Founder list — gated to ADMIN by the gateway (/api/videocall/admin in ADMIN_PATHS). */
    @GetMapping("/admin/eligibility")
    public List<EligibilitySummary> adminEligibility() {
        return service.listEligibility();
    }

    private boolean isGuestOrMissing(String userId) {
        return userId == null || userId.isBlank() || userId.startsWith("guest-");
    }

    private void requireRealUser(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new UnauthorizedException("Missing " + USER_HEADER + " header");
        }
        if (userId.startsWith("guest-")) {
            throw new ForbiddenException("Guests cannot register interest — please log in");
        }
    }
}
