package com.varsha.auth.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User {

    @Id
    private String id;  // Google "sub", or "usr-<uuid>" (password/OTP self-registered), or "guest-<uuid>"

    // Nullable since V3: a phone-OTP-only user may have no email. Unique index tolerates many NULLs.
    @Column(unique = true)
    private String email;

    // Self-registered login fields (V3). NULL for Google/email-only accounts respectively.
    @Column(unique = true)
    private String phone;

    // BCrypt hash only — never plaintext, never returned by any endpoint.
    @Column(name = "password_hash")
    private String passwordHash;

    private String name;
    private String picture;

    @Column(name = "display_name")
    private String displayName;

    // RBAC role: "USER" (default) or "ADMIN". Promotion is driven by the app.admin-emails allowlist.
    @Column(nullable = false)
    private String role = "USER";

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public User() {}

    public User(String id, String email, String name, String picture) {
        this.id = id;
        this.email = email;
        this.name = name;
        this.picture = picture;
    }

    public String getId() { return id; }
    public String getEmail() { return email; }
    public String getPhone() { return phone; }
    public String getPasswordHash() { return passwordHash; }
    public String getName() { return name; }
    public String getPicture() { return picture; }
    public String getDisplayName() { return displayName; }
    public String getRole() { return role; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setId(String id) { this.id = id; }
    public void setEmail(String email) { this.email = email; }
    public void setPhone(String phone) { this.phone = phone; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public void setName(String name) { this.name = name; }
    public void setPicture(String picture) { this.picture = picture; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public void setRole(String role) { this.role = role; }
}
