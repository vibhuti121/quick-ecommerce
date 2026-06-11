package com.varsha.videocall.service;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.Map;

/**
 * Mints the short-lived call GRANT — the ONLY token that admits a socket to the signaling-service.
 *
 * Security invariants (mirror what signaling-service/src/auth.ts verifies):
 *  - signed with VIDEOCALL_GRANT_SECRET, a secret DISTINCT from the login JWT_SECRET, so a stolen or
 *    replayed login token is not a valid grant;
 *  - aud = "videocall-grant" (single-purpose — rejected anywhere else);
 *  - exp = iat + grant-ttl-seconds (600 = the 10-minute hard cap, baked in — the socket cannot outlive it);
 *  - room-bound (roomId claim) so a grant for room A cannot join room B;
 *  - maxParticipants = 3 asserted as a claim, independently of the signaling roomManager's own cap.
 */
@Service
public class GrantService {

    public static final String AUDIENCE = "videocall-grant";
    public static final int MAX_PARTICIPANTS = 3;

    private final String secret;
    private final long ttlSeconds;

    public GrantService(@Value("${app.videocall.grant-secret}") String secret,
                        @Value("${app.videocall.grant-ttl-seconds:600}") long ttlSeconds) {
        this.secret = secret;
        this.ttlSeconds = ttlSeconds;
    }

    private Key key() {
        // hmacShaKeyFor requires >= 256-bit (32-byte) material; VIDEOCALL_GRANT_SECRET is openssl rand
        // -base64 32 (44 chars), comfortably above the floor. The signaling-service uses the UTF-8 bytes
        // of this same string as its HMAC key, so the two sides agree.
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public long getTtlSeconds() {
        return ttlSeconds;
    }

    public String mint(String userId, String email, String displayName, String roomId) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .setSubject(userId)
                .setAudience(AUDIENCE)
                .addClaims(Map.of(
                        "email", email != null ? email : "",
                        "displayName", displayName != null ? displayName : (email != null ? email : userId),
                        "roomId", roomId,
                        "maxParticipants", MAX_PARTICIPANTS))
                .setIssuedAt(new Date(now))
                .setExpiration(new Date(now + ttlSeconds * 1000))
                .signWith(key(), SignatureAlgorithm.HS256)
                .compact();
    }
}
