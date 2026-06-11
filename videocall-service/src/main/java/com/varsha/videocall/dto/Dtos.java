package com.varsha.videocall.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;
import java.util.List;

/** All request/response shapes for the videocall API, kept together (mirrors inventory-service's Dtos). */
public final class Dtos {

    private Dtos() {
    }

    /** Optional body for POST /grant — a returning invitee passes the host's roomId to join it. */
    public record GrantRequest(String roomId) {
    }

    /** A single ICE server entry for the browser's RTCPeerConnection config. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record IceServer(List<String> urls, String username, String credential) {
    }

    /**
     * The gate's answer. When NOT available it serializes as exactly {@code {"available":false}} — no
     * reason, no countdown (the silent block). Cooldown and "no capacity" are indistinguishable here by
     * design.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record GrantResponse(boolean available,
                                String grant,
                                String roomId,
                                Long expiresInSeconds,
                                List<IceServer> iceServers) {

        public static GrantResponse unavailable() {
            return new GrantResponse(false, null, null, null, null);
        }

        public static GrantResponse available(String grant, String roomId, long ttlSeconds,
                                              List<IceServer> iceServers) {
            return new GrantResponse(true, grant, roomId, ttlSeconds, iceServers);
        }
    }

    /** Response to POST /eligibility. {@code created} distinguishes a fresh record (201) from an idempotent re-post (200). */
    public record EligibilityResponse(boolean eligible, boolean created) {
    }

    /** A row in the founder's admin eligibility list. */
    public record EligibilitySummary(String userId, String email, OffsetDateTime createdAt) {
    }
}
