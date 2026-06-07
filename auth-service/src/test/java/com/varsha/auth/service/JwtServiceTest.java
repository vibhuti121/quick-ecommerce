package com.varsha.auth.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.*;

class JwtServiceTest {

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService();
        // Must be ≥ 32 bytes for HS256
        ReflectionTestUtils.setField(jwtService, "secret", "test-secret-that-is-long-enough-32chars");
        ReflectionTestUtils.setField(jwtService, "expirationMs", 3_600_000L);
    }

    @Test
    void generate_produces_parseable_token() {
        String token = jwtService.generate("user123", "test@example.com", "Test User");
        assertThat(token).isNotBlank();

        Claims claims = jwtService.validate(token);
        assertThat(claims.getSubject()).isEqualTo("user123");
        assertThat(claims.get("email", String.class)).isEqualTo("test@example.com");
        assertThat(claims.get("displayName", String.class)).isEqualTo("Test User");
    }

    @Test
    void validate_throws_on_tampered_token() {
        String token = jwtService.generate("u1", "a@a.com", "User1");
        String tampered = token.substring(0, token.length() - 5) + "XXXXX";
        assertThatThrownBy(() -> jwtService.validate(tampered))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void validate_throws_on_expired_token() {
        ReflectionTestUtils.setField(jwtService, "expirationMs", -1000L);
        String token = jwtService.generate("u1", "a@a.com", "User1");
        assertThatThrownBy(() -> jwtService.validate(token))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void validate_throws_on_empty_string() {
        assertThatThrownBy(() -> jwtService.validate(""))
                .isInstanceOf(Exception.class);
    }

    @Test
    void generate_sets_expiration() {
        String token = jwtService.generate("u1", "a@a.com", "User1");
        Claims claims = jwtService.validate(token);
        assertThat(claims.getExpiration()).isAfter(claims.getIssuedAt());
    }
}
