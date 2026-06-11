package com.varsha.auth.controller;

import com.varsha.auth.model.User;
import com.varsha.auth.service.DuplicateAccountException;
import com.varsha.auth.service.JwtService;
import com.varsha.auth.service.OtpService;
import com.varsha.auth.service.UserService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
public class AuthController {

    private final JwtService jwtService;
    private final UserService userService;
    private final OtpService otpService;

    public AuthController(JwtService jwtService, UserService userService, OtpService otpService) {
        this.jwtService = jwtService;
        this.userService = userService;
        this.otpService = otpService;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    record GuestTokenRequest(@NotBlank @Size(min = 1, max = 40) String name) {}

    @PostMapping("/auth/guest")
    public ResponseEntity<Map<String, Object>> guestToken(@Valid @RequestBody GuestTokenRequest req) {
        String guestId = "guest-" + UUID.randomUUID();
        String token = jwtService.generateGuest(guestId, req.name().trim());
        return ResponseEntity.ok(Map.of("token", token));
    }

    // ---- Self-registered login (Method A: email/phone + password) -------------------------------
    // identifier = email (has '@') or an Indian-style phone; password 8..72 (BCrypt's byte cap).
    record RegisterRequest(
            @NotBlank @Size(max = 120) String identifier,
            @NotBlank @Size(min = 8, max = 72) String password,
            @Size(max = 40) String displayName) {}

    record LoginRequest(
            @NotBlank @Size(max = 120) String identifier,
            @NotBlank @Size(max = 72) String password) {}

    @PostMapping("/auth/register")
    public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody RegisterRequest req) {
        if (!isValidIdentifier(req.identifier())) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid email or phone"));
        }
        try {
            User user = userService.registerWithPassword(
                    req.identifier(), req.password(), req.displayName());
            String resolved = userService.resolvedName(user);
            String token = jwtService.generate(user.getId(), user.getEmail(), resolved, user.getRole());
            return ResponseEntity.status(201).body(Map.of("token", token, "displayName", resolved));
        } catch (DuplicateAccountException e) {
            // Registration inherently reveals existence; clear 409 here, generic 401 on login.
            return ResponseEntity.status(409).body(Map.of("error", "account already exists"));
        }
    }

    @PostMapping("/auth/login")
    public ResponseEntity<Map<String, Object>> login(@Valid @RequestBody LoginRequest req) {
        Optional<User> user = userService.verifyPassword(req.identifier(), req.password());
        if (user.isEmpty()) {
            // GENERIC — never reveal whether identifier or password was wrong (anti-enumeration).
            return ResponseEntity.status(401).body(Map.of("error", "invalid credentials"));
        }
        User u = user.get();
        String resolved = userService.resolvedName(u);
        String token = jwtService.generate(u.getId(), u.getEmail(), resolved, u.getRole());
        return ResponseEntity.ok(Map.of("token", token, "displayName", resolved));
    }

    // Light server-side format guard (the frontend validates too). Email: minimal shape check.
    // Phone: 8..15 chars of digits with an optional leading '+' (covers +91XXXXXXXXXX and 10-digit).
    private static boolean isValidIdentifier(String identifier) {
        String id = identifier.trim();
        if (UserService.isEmail(id)) {
            return id.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
        }
        return id.matches("^\\+?[0-9]{8,15}$");
    }

    // ---- Phone OTP (Method B: dev stub now, real SMS provider at go-live) ------------------------
    record OtpRequestRequest(
            @NotBlank @Pattern(regexp = "^\\+?[0-9]{8,15}$", message = "invalid phone") String phone) {}

    record OtpVerifyRequest(
            @NotBlank @Pattern(regexp = "^\\+?[0-9]{8,15}$", message = "invalid phone") String phone,
            @NotBlank @Pattern(regexp = "^[0-9]{4,8}$", message = "invalid code") String code) {}

    @PostMapping("/auth/otp/request")
    public ResponseEntity<Map<String, Object>> otpRequest(@Valid @RequestBody OtpRequestRequest req) {
        Optional<String> echoed = otpService.request(req.phone().trim());
        // NEUTRAL: always {sent:true}, whether the phone is known, unknown, or throttled — no oracle.
        Map<String, Object> body = new HashMap<>();
        body.put("sent", true);
        echoed.ifPresent(code -> body.put("devCode", code));  // only present when app.otp.dev-echo=true
        return ResponseEntity.ok(body);
    }

    @PostMapping("/auth/otp/verify")
    public ResponseEntity<Map<String, Object>> otpVerify(@Valid @RequestBody OtpVerifyRequest req) {
        String phone = req.phone().trim();
        OtpService.VerifyResult result = otpService.verify(phone, req.code().trim());
        switch (result) {
            case OK -> {
                User user = userService.findOrCreateByPhone(phone);
                String resolved = userService.resolvedName(user);
                String token = jwtService.generate(user.getId(), user.getEmail(), resolved, user.getRole());
                return ResponseEntity.ok(Map.of("token", token, "displayName", resolved));
            }
            case TOO_MANY_ATTEMPTS -> {
                return ResponseEntity.status(429)
                        .body(Map.of("error", "too many attempts, request a new code"));
            }
            default -> {
                // NO_CODE and MISMATCH collapse to one generic message — no oracle on code validity.
                return ResponseEntity.status(401).body(Map.of("error", "invalid or expired code"));
            }
        }
    }

    // Called by gateway to validate every incoming request
    @GetMapping("/auth/validate")
    public ResponseEntity<Map<String, Object>> validate(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(401).body(Map.of("error", "Missing token"));
        }

        try {
            Claims claims = jwtService.validate(authHeader.substring(7));
            String displayName = claims.get("displayName", String.class);
            // Tokens minted before RBAC have no role claim → treat as USER (least privilege).
            String role = claims.get("role", String.class);
            // email is "" for phone-only accounts; guard null defensively (Map.of is null-hostile).
            String email = claims.get("email", String.class);
            return ResponseEntity.ok(Map.of(
                "userId", claims.getSubject(),
                "email", email != null ? email : "",
                "displayName", displayName != null ? displayName : "",
                "role", role != null ? role : "USER"
            ));
        } catch (JwtException e) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid token"));
        }
    }

    // Returns full user profile — gateway has already validated JWT before this is reached
    @GetMapping("/auth/me")
    public ResponseEntity<Map<String, Object>> me(
            @RequestHeader("X-User-Id") String userId) {

        return userService.findById(userId).map(user -> {
            Map<String, Object> body = new HashMap<>();
            body.put("userId", user.getId());
            body.put("email", user.getEmail());
            body.put("name", user.getName() != null ? user.getName() : "");
            body.put("picture", user.getPicture() != null ? user.getPicture() : "");
            body.put("displayName", userService.resolvedName(user));
            body.put("displayNameSet", user.getDisplayName() != null && !user.getDisplayName().isBlank());
            return ResponseEntity.ok(body);
        }).orElse(ResponseEntity.status(404).body(Map.of("error", "User not found")));
    }

    record DisplayNameRequest(@NotBlank @Size(min = 1, max = 40) String displayName) {}

    @PutMapping("/auth/me/display-name")
    public ResponseEntity<Map<String, Object>> updateDisplayName(
            @RequestHeader("X-User-Id") String userId,
            @Valid @RequestBody DisplayNameRequest req) {

        User user = userService.updateDisplayName(userId, req.displayName().trim());
        String resolved = userService.resolvedName(user);
        String newToken = jwtService.generate(user.getId(), user.getEmail(), resolved, user.getRole());
        return ResponseEntity.ok(Map.of("token", newToken, "displayName", resolved));
    }
}
