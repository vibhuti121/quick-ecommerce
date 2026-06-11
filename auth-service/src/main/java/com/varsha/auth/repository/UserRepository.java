package com.varsha.auth.repository;

import com.varsha.auth.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, String> {
    // Identifier lookups for self-registered (password / OTP) login. Both columns are uniquely
    // indexed (email's existing index; phone's V3 partial index), so at most one row each.
    Optional<User> findByEmail(String email);
    Optional<User> findByPhone(String phone);
}
