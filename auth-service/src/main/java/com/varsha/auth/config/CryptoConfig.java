package com.varsha.auth.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Holds the {@link PasswordEncoder} bean on its own — deliberately NOT in {@link SecurityConfig}.
 * SecurityConfig depends on OAuth2SuccessHandler → UserService, and UserService needs the
 * PasswordEncoder; defining the encoder in SecurityConfig would close that into a constructor
 * cycle (SecurityConfig ← OAuth2SuccessHandler ← UserService ← SecurityConfig) and Spring Boot
 * refuses circular references by default. A standalone config with no dependencies breaks it.
 *
 * BCrypt is in-process (spring-security-crypto, already on the classpath via the security starter):
 * no new dependency, zero ongoing cost.
 */
@Configuration
public class CryptoConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
