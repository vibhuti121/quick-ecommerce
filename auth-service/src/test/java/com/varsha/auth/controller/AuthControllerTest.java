package com.varsha.auth.controller;

import com.varsha.auth.model.User;
import com.varsha.auth.service.JwtService;
import com.varsha.auth.service.UserService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.impl.DefaultClaims;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
@Import(TestSecurityConfig.class)
class AuthControllerTest {

    @Autowired
    MockMvc mvc;

    @MockBean JwtService jwtService;
    @MockBean UserService userService;

    @Test
    void health_returns_ok() throws Exception {
        mvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void validate_returns_user_info_for_valid_token() throws Exception {
        Claims claims = makeClaims("user123", "test@example.com");
        when(jwtService.validate("good-token")).thenReturn(claims);

        mvc.perform(get("/auth/validate")
                        .header("Authorization", "Bearer good-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value("user123"))
                .andExpect(jsonPath("$.email").value("test@example.com"));
    }

    @Test
    void validate_returns_401_when_no_header() throws Exception {
        mvc.perform(get("/auth/validate"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Missing token"));
    }

    @Test
    void validate_returns_401_when_not_bearer() throws Exception {
        mvc.perform(get("/auth/validate")
                        .header("Authorization", "Basic dXNlcjpwYXNz"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Missing token"));
    }

    @Test
    void validate_returns_401_for_invalid_token() throws Exception {
        when(jwtService.validate("bad-token"))
                .thenThrow(new ExpiredJwtException(null, null, "expired"));

        mvc.perform(get("/auth/validate")
                        .header("Authorization", "Bearer bad-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid token"));
    }

    @Test
    void me_returns_user_profile() throws Exception {
        User user = new User("user456", "me@example.com", "Alice", null);
        when(userService.findById("user456")).thenReturn(Optional.of(user));
        when(userService.resolvedName(user)).thenReturn("Alice");

        mvc.perform(get("/auth/me")
                        .header("X-User-Id", "user456"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value("user456"))
                .andExpect(jsonPath("$.email").value("me@example.com"))
                .andExpect(jsonPath("$.displayName").value("Alice"));
    }

    @Test
    void me_returns_404_when_user_not_found() throws Exception {
        when(userService.findById("unknown")).thenReturn(Optional.empty());

        mvc.perform(get("/auth/me")
                        .header("X-User-Id", "unknown"))
                .andExpect(status().isNotFound());
    }

    private static Claims makeClaims(String subject, String email) {
        return new DefaultClaims(Map.of("sub", subject, "email", email));
    }
}
