package com.varsha.auth.config;

import com.varsha.auth.model.User;
import com.varsha.auth.service.JwtService;
import com.varsha.auth.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private final JwtService jwtService;
    private final UserService userService;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public OAuth2SuccessHandler(JwtService jwtService, UserService userService) {
        this.jwtService = jwtService;
        this.userService = userService;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException {
        OAuth2User oauth2User = (OAuth2User) authentication.getPrincipal();
        User user = userService.upsert(oauth2User);
        String token = jwtService.generate(user.getId(), user.getEmail(), userService.resolvedName(user));
        // Send token to frontend via redirect — frontend stores it in localStorage
        response.sendRedirect(frontendUrl + "/auth/callback?token=" + token);
    }
}
