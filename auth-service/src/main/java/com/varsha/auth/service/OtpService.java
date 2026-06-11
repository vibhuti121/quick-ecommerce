package com.varsha.auth.service;

import com.varsha.auth.repository.OtpRepository;
import com.varsha.auth.service.sms.SmsSender;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Optional;

/**
 * Phone-OTP orchestration: generate → hash+store → send (via the SmsSender seam) → verify.
 *
 * Security posture (the founder's "can't be hacked" bar):
 *  - Codes are stored HASHED (SHA-256, peppered with JWT_SECRET + bound to the phone), never plaintext,
 *    so a Redis dump alone can't be replayed without also knowing the secret.
 *  - Short TTL + a hard attempt cap + a resend throttle bound brute-force and SMS-bombing/cost-abuse.
 *  - request() always reports neutrally to the caller (no "is this phone known?" signal).
 */
@Service
public class OtpService {

    private final OtpRepository otpRepo;
    private final SmsSender smsSender;
    private final SecureRandom random = new SecureRandom();
    private final String pepper;
    private final int codeLength;
    private final int maxAttempts;
    private final boolean devEcho;

    public OtpService(OtpRepository otpRepo,
                      SmsSender smsSender,
                      @Value("${app.jwt.secret}") String pepper,
                      @Value("${app.otp.code-length:6}") int codeLength,
                      @Value("${app.otp.max-attempts:5}") int maxAttempts,
                      @Value("${app.otp.dev-echo:false}") boolean devEcho) {
        this.otpRepo = otpRepo;
        this.smsSender = smsSender;
        this.pepper = pepper;
        this.codeLength = codeLength;
        this.maxAttempts = maxAttempts;
        this.devEcho = devEcho;
    }

    public boolean isDevEcho() { return devEcho; }

    /**
     * Request an OTP for a phone. Returns the plaintext code ONLY when dev-echo is on (for local/CI
     * assertions); otherwise empty. Returns empty WITHOUT generating when the resend throttle trips —
     * the controller reports the same neutral response either way, so a caller can't tell.
     */
    public Optional<String> request(String phone) {
        if (!otpRepo.tryClaimResendWindow(phone)) {
            return Optional.empty();  // throttled — neutral to the caller
        }
        String code = generateCode();
        otpRepo.storeCode(phone, hash(phone, code));
        smsSender.sendOtp(phone, code);
        return devEcho ? Optional.of(code) : Optional.empty();
    }

    public enum VerifyResult { OK, NO_CODE, MISMATCH, TOO_MANY_ATTEMPTS }

    /** Verify a submitted code. On OK the code is burned; on too many attempts the code is burned too. */
    public VerifyResult verify(String phone, String submittedCode) {
        Optional<String> stored = otpRepo.getCode(phone);
        if (stored.isEmpty()) {
            return VerifyResult.NO_CODE;  // never issued, expired, or already used
        }
        // Count this attempt first, so a flood of guesses can't run unbounded.
        long attempts = otpRepo.incrementAttempts(phone);
        if (attempts > maxAttempts) {
            otpRepo.clear(phone);  // burn the code — force a fresh request
            return VerifyResult.TOO_MANY_ATTEMPTS;
        }
        if (constantTimeEquals(stored.get(), hash(phone, submittedCode))) {
            otpRepo.clear(phone);
            return VerifyResult.OK;
        }
        return VerifyResult.MISMATCH;
    }

    private String generateCode() {
        int bound = (int) Math.pow(10, codeLength);
        int n = random.nextInt(bound);
        return String.format("%0" + codeLength + "d", n);
    }

    private String hash(String phone, String code) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest((pepper + ":" + phone + ":" + code).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
