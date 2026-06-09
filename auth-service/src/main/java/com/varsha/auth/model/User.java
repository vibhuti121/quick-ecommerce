package com.varsha.auth.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User {

    @Id
    private String id;  // Google sub

    @Column(unique = true, nullable = false)
    private String email;

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
    public String getName() { return name; }
    public String getPicture() { return picture; }
    public String getDisplayName() { return displayName; }
    public String getRole() { return role; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setEmail(String email) { this.email = email; }
    public void setName(String name) { this.name = name; }
    public void setPicture(String picture) { this.picture = picture; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public void setRole(String role) { this.role = role; }
}
