package com.varsha.catalog.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A launch-interest signup ("🔔 Notify me") captured from the storefront carousel/teaser. One row per
 * (topic, phone) — the DB unique index in V4 backs the service-level idempotency so a re-submit is a
 * no-op rather than a duplicate. Customer-supplied data (public endpoint), so the columns are bounded
 * and the phone is the client-normalized 10-digit form; email is optional.
 */
@Entity
@Table(name = "notify_signups")
public class NotifySignup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Subject the visitor wants alerts about: honey | litchi | gi | delivery. */
    @Column(nullable = false, length = 32)
    private String topic;

    /** Normalized 10-digit Indian mobile. */
    @Column(nullable = false, length = 20)
    private String phone;

    /** Optional contact email (lowercased), null when not provided. */
    @Column(length = 255)
    private String email;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTopic() { return topic; }
    public void setTopic(String topic) { this.topic = topic; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
