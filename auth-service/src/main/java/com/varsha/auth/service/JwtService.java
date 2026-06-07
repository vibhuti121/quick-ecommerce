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

    public String generate(String userId, String email, String displayName) {
        return Jwts.builder()
                .setSubject(userId)
                .addClaims(Map.of("email", email, "displayName", displayName != null ? displayName : email))
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key(), SignatureAlgorithm.HS256)
                .compact();
    }

    public String generateGuest(String guestId, String displayName) {
        return Jwts.builder()
                .setSubject(guestId)
                .addClaims(Map.of("email", displayName))
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
