package com.varsha.auth.service;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.Map;

@Service
public class JwtService {

    @Value("${app.jwt.secret}")
    private String secret;

    @Value("${app.jwt.expiration-ms}")
    private long expirationMs;

    @Value("${app.jwt.guest-expiration-ms:1800000}")
    private long guestExpirationMs;

    private Key key() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String generate(String userId, String email, String displayName, String role) {
        // email may be null for a phone-OTP / phone-password account. Map.of is null-hostile and the
        // gateway's /auth/validate also Map.of's the email claim, so coerce null → "" at the source.
        String safeEmail = email != null ? email : "";
        return Jwts.builder()
                .setSubject(userId)
                .addClaims(Map.of(
                        "email", safeEmail,
                        "displayName", displayName != null ? displayName : safeEmail,
                        "role", role != null ? role : "USER"))
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key(), SignatureAlgorithm.HS256)
                .compact();
    }

    public String generateGuest(String guestId, String displayName) {
        // Guests are never admins — the role is pinned to USER here, not derived from any input.
        return Jwts.builder()
                .setSubject(guestId)
                .addClaims(Map.of("email", displayName, "role", "USER"))
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + guestExpirationMs))
                .signWith(key(), SignatureAlgorithm.HS256)
                .compact();
    }

    public Claims validate(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(key())
                .build()
                .parseClaimsJws(token)
                .getBody();
    }
}
