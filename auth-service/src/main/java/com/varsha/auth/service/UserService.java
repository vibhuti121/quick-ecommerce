package com.varsha.auth.service;

import com.varsha.auth.model.User;
import com.varsha.auth.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class UserService {

    private final UserRepository repo;
    // Case-insensitive allowlist of emails that are granted the ADMIN role on login.
    private final Set<String> adminEmails;

    public UserService(UserRepository repo,
                       @Value("${app.admin-emails:}") String adminEmailsCsv) {
        this.repo = repo;
        this.adminEmails = Arrays.stream(adminEmailsCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .map(s -> s.toLowerCase())
                .collect(Collectors.toUnmodifiableSet());
    }

    public User upsert(OAuth2User oauth2User) {
        String id = oauth2User.getAttribute("sub");
        String email = oauth2User.getAttribute("email");
        String name = oauth2User.getAttribute("name");
        String picture = oauth2User.getAttribute("picture");
        // Re-evaluate role on every login so allowlist changes take effect on next sign-in.
        String role = roleFor(email);

        return repo.findById(id).map(existing -> {
            existing.setEmail(email);
            existing.setName(name);
            existing.setPicture(picture);
            existing.setRole(role);
            return repo.save(existing);
        }).orElseGet(() -> {
            User created = new User(id, email, name, picture);
            created.setRole(role);
            return repo.save(created);
        });
    }

    /** ADMIN iff the email is on the allowlist (case-insensitive); USER otherwise. */
    private String roleFor(String email) {
        return email != null && adminEmails.contains(email.toLowerCase()) ? "ADMIN" : "USER";
    }

    public Optional<User> findById(String id) {
        return repo.findById(id);
    }

    public User updateDisplayName(String userId, String displayName) {
        User user = repo.findById(userId).orElseThrow();
        user.setDisplayName(displayName);
        return repo.save(user);
    }

    // displayName (user-set) → name (Google name) → email
    public String resolvedName(User user) {
        if (user.getDisplayName() != null && !user.getDisplayName().isBlank()) return user.getDisplayName();
        if (user.getName() != null && !user.getName().isBlank()) return user.getName();
        return user.getEmail();
    }
}
