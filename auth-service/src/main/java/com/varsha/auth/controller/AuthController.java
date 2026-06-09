package com.varsha.auth.controller;

import com.varsha.auth.model.User;
import com.varsha.auth.service.JwtService;
import com.varsha.auth.service.UserService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
public class AuthController {

    private final JwtService jwtService;
    private final UserService userService;

    public AuthController(JwtService jwtService, UserService userService) {
        this.jwtService = jwtService;
        this.userService = userService;
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
            return ResponseEntity.ok(Map.of(
                "userId", claims.getSubject(),
                "email", claims.get("email", String.class),
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
