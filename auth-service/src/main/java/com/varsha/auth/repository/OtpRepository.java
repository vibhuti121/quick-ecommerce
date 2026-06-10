package com.varsha.auth.repository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.util.Optional;

/**
 * Redis-backed OTP store. Three short-lived keys per phone, all keyed off the phone number:
 *   otp:{phone}          → the HASHED code (never plaintext), TTL = ttl-seconds
 *   otp:attempts:{phone} → verify-attempt counter, same TTL as the code (burned together)
 *   otp:resend:{phone}   → resend throttle marker, TTL = resend-window-seconds
 * Mirrors the videocall CooldownRepository setIfAbsent pattern for the atomic resend claim.
 */
@Repository
public class OtpRepository {

    private static final String CODE_PREFIX = "otp:";
    private static final String ATTEMPTS_PREFIX = "otp:attempts:";
    private static final String RESEND_PREFIX = "otp:resend:";

    private final StringRedisTemplate redis;
    private final Duration ttl;
    private final Duration resendWindow;

    public OtpRepository(StringRedisTemplate redis,
                         @Value("${app.otp.ttl-seconds:300}") long ttlSeconds,
                         @Value("${app.otp.resend-window-seconds:60}") long resendWindowSeconds) {
        this.redis = redis;
        this.ttl = Duration.ofSeconds(ttlSeconds);
        this.resendWindow = Duration.ofSeconds(resendWindowSeconds);
    }

    /** Atomically claim the resend window. true = allowed to send now; false = within the throttle. */
    public boolean tryClaimResendWindow(String phone) {
        Boolean ok = redis.opsForValue().setIfAbsent(RESEND_PREFIX + phone, "1", resendWindow);
        return Boolean.TRUE.equals(ok);
    }

    /** Store the hashed code with the standard TTL and reset the attempt counter for this phone. */
    public void storeCode(String phone, String hashedCode) {
        redis.opsForValue().set(CODE_PREFIX + phone, hashedCode, ttl);
        redis.delete(ATTEMPTS_PREFIX + phone);
    }

    public Optional<String> getCode(String phone) {
        return Optional.ofNullable(redis.opsForValue().get(CODE_PREFIX + phone));
    }

    /** Increment the attempt counter (creating it with the code's TTL) and return the new count. */
    public long incrementAttempts(String phone) {
        String key = ATTEMPTS_PREFIX + phone;
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redis.expire(key, ttl);  // tie the counter's lifetime to the code's
        }
        return count != null ? count : 0L;
    }

    /** Burn the code + attempts (on success, or when the attempt cap is hit). */
    public void clear(String phone) {
        redis.delete(CODE_PREFIX + phone);
        redis.delete(ATTEMPTS_PREFIX + phone);
    }
}
