package com.varsha.videocall.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

/** One row per user who completed the interest form — the eligibility gate for a call grant. */
@Entity
@Table(name = "videocall_eligibility")
public class Eligibility {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true, length = 64)
    private String userId;

    @Column(name = "email", length = 255)
    private String email;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected Eligibility() {
    }

    public Eligibility(String userId, String email) {
        this.userId = userId;
        this.email = email;
        this.createdAt = OffsetDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public String getUserId() {
        return userId;
    }

    public String getEmail() {
        return email;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
