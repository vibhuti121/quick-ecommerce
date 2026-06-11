package com.varsha.auth.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

/**
 * Puts a privacy-preserving {@code user_id} into the MDC so every log line on this request is
 * attributable to a user WITHOUT writing the raw id/email/phone to the log store (observability
 * Pillar 2B). The gateway keeps forwarding the RAW {@code X-User-Id} (services need it for business
 * logic) — here we derive ONLY the log identity:
 *   {@code user_id = HMAC-SHA256(LOG_HASH_SECRET, rawUserId)}, hex, 16-char prefix.
 *
 * <p>HMAC (keyed), not a bare hash, so the id can't be brute-forced from a small id space;
 * deterministic, so an on-call resolving a dispute hashes a known user's id and greps the cold log
 * tier for their cross-service journey. The {@code LogstashEncoder} includes MDC by default (Phase 1),
 * so this lands in the JSON logs with no appender change.
 *
 * <p>MDC is thread-local and servlet threads are pooled — we MUST clear it in {@code finally}, or the
 * next request on this thread inherits the previous user's id. If the secret is absent (dev without
 * gen-secrets), we fail safe: no {@code user_id} is emitted rather than a raw or unkeyed one.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10) // run early so every downstream log line (and other filters) carries user_id
public class UserIdMdcFilter extends OncePerRequestFilter {

    private static final String MDC_KEY = "user_id";
    private static final String HEADER = "X-User-Id";

    private final byte[] key;

    public UserIdMdcFilter(@Value("${LOG_HASH_SECRET:}") String secret) {
        this.key = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        boolean set = false;
        String raw = request.getHeader(HEADER);
        if (raw != null && !raw.isBlank() && key.length > 0) {
            MDC.put(MDC_KEY, hash(raw));
            set = true;
        }
        try {
            chain.doFilter(request, response);
        } finally {
            if (set) MDC.remove(MDC_KEY);
        }
    }

    private String hash(String raw) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] h = mac.doFinal(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h).substring(0, 16); // 64-bit prefix — ample for dispute lookup
        } catch (Exception e) {
            return "hash_error";
        }
    }
}
