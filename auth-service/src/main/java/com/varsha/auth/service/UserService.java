package com.varsha.auth.service;

import com.varsha.auth.model.User;
import com.varsha.auth.repository.UserRepository;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class UserService {

    private final UserRepository repo;
    private final PasswordEncoder passwordEncoder;
    // Case-insensitive allowlist of emails that are granted the ADMIN role on login.
    private final Set<String> adminEmails;
    // Business meter (Pillar 3): signups_total{method} — net new password-backed accounts, tagged by the
    // identifier kind (email|phone). OAuth upsert is a login/merge, not a signup, so it is not counted here.
    private final MeterRegistry meters;

    public UserService(UserRepository repo,
                       PasswordEncoder passwordEncoder,
                       @Value("${app.admin-emails:}") String adminEmailsCsv,
                       MeterRegistry meters) {
        this.repo = repo;
        this.passwordEncoder = passwordEncoder;
        this.meters = meters;
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

    /** An identifier is an email if it contains '@'; otherwise it's treated as a phone number. */
    public static boolean isEmail(String identifier) {
        return identifier != null && identifier.contains("@");
    }

    /**
     * Create a self-registered, password-backed account. {@code identifier} is an email or a phone.
     * id is namespaced "usr-<uuid>" so it never collides with a Google "sub" or a "guest-" id, and
     * the guest-rejection logic elsewhere (sub.startsWith("guest-")) is unaffected. Throws
     * {@link DuplicateAccountException} if the identifier is already registered.
     */
    public User registerWithPassword(String identifier, String rawPassword, String displayName) {
        boolean email = isEmail(identifier);
        String normalized = email ? identifier.trim().toLowerCase() : identifier.trim();

        boolean exists = email ? repo.findByEmail(normalized).isPresent()
                               : repo.findByPhone(normalized).isPresent();
        if (exists) {
            throw new DuplicateAccountException();
        }

        User user = new User();
        user.setId("usr-" + UUID.randomUUID());
        if (email) {
            user.setEmail(normalized);
        } else {
            user.setPhone(normalized);
        }
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        user.setDisplayName(displayName == null || displayName.isBlank() ? null : displayName.trim());
        user.setRole(roleFor(email ? normalized : null));
        User saved = repo.save(user);
        meters.counter("signups", "method", email ? "email" : "phone").increment();
        return saved;
    }

    /**
     * Verify a password login. Returns the user only on a correct match; empty otherwise — the
     * caller must NOT distinguish "no such account" from "wrong password" (anti-enumeration).
     * passwordEncoder.matches is invoked even when the account is missing/passwordless only via the
     * same generic empty return — timing is not constant-time hardened here (acceptable for this tier).
     */
    public Optional<User> verifyPassword(String identifier, String rawPassword) {
        boolean email = isEmail(identifier);
        String normalized = email ? identifier.trim().toLowerCase() : identifier.trim();
        Optional<User> found = email ? repo.findByEmail(normalized) : repo.findByPhone(normalized);
        return found.filter(u -> u.getPasswordHash() != null
                && passwordEncoder.matches(rawPassword, u.getPasswordHash()));
    }

    public Optional<User> findById(String id) {
        return repo.findById(id);
    }

    /**
     * OTP login upsert: return the existing phone account, or mint a minimal "usr-<uuid>" one with no
     * email/password. Called only AFTER the OTP is verified, so possession of the phone is proven.
     */
    public User findOrCreateByPhone(String phone) {
        String normalized = phone.trim();
        return repo.findByPhone(normalized).orElseGet(() -> {
            User user = new User();
            user.setId("usr-" + UUID.randomUUID());
            user.setPhone(normalized);
            user.setRole("USER");  // phone-only accounts are never on the email admin allowlist
            return repo.save(user);
        });
    }

    /**
     * Google Sign-In (Taste Match V7) find-or-create by a Google-VERIFIED email. Called only after
     * {@link GoogleAuthService} has validated the credential with Google (aud + email_verified), so the
     * email is trusted. Returns the existing account for that email, or mints a fresh "usr-&lt;uuid&gt;"
     * one; refreshes name/picture and re-evaluates the admin allowlist on every sign-in (same spirit as
     * the OAuth2 {@link #upsert} path). This is a login/merge, not a net-new password signup, so it is
     * deliberately NOT counted by the signups meter.
     */
    public User findOrCreateByGoogleEmail(String verifiedEmail, String name, String picture) {
        String email = verifiedEmail.trim().toLowerCase();
        String role = roleFor(email);
        return repo.findByEmail(email).map(existing -> {
            if (name != null && !name.isBlank()) existing.setName(name);
            if (picture != null && !picture.isBlank()) existing.setPicture(picture);
            existing.setRole(role);
            return repo.save(existing);
        }).orElseGet(() -> {
            User created = new User();
            created.setId("usr-" + UUID.randomUUID());
            created.setEmail(email);
            created.setName(name);
            created.setPicture(picture);
            created.setRole(role);
            return repo.save(created);
        });
    }

    public User updateDisplayName(String userId, String displayName) {
        User user = repo.findById(userId).orElseThrow();
        user.setDisplayName(displayName);
        return repo.save(user);
    }

    // displayName (user-set) → name (Google name) → email → phone → "User".
    // Must never return null: callers put this into Map.of(...) and JWT claims, both null-hostile.
    public String resolvedName(User user) {
        if (user.getDisplayName() != null && !user.getDisplayName().isBlank()) return user.getDisplayName();
        if (user.getName() != null && !user.getName().isBlank()) return user.getName();
        if (user.getEmail() != null && !user.getEmail().isBlank()) return user.getEmail();
        if (user.getPhone() != null && !user.getPhone().isBlank()) return user.getPhone();
        return "User";
    }
}
