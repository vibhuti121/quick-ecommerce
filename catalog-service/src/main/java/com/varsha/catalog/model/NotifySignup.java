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

    /**
     * Subject the visitor wants alerts about. For the honey teaser this is a fixed key
     * (honey | litchi | gi | delivery); for the fruit quiz the row fans out one-per-fruit and the topic
     * is the chosen fruit slug (e.g. 'litchi', 'mango'), plus one umbrella 'quiz' row per completion.
     * Either way it stays ≤ 32 chars (DTO-bounded), so per-fruit demand is a {@code GROUP BY topic}.
     */
    @Column(nullable = false, length = 32)
    private String topic;

    /** Visitor's name. The quiz asks for it; the older honey teaser did not, so it's nullable. */
    @Column(length = 128)
    private String name;

    /** Which storefront surface captured the lead: 'quiz' | 'teaser'. Null for pre-existing rows. */
    @Column(length = 32)
    private String source;

    /** Normalized 10-digit Indian mobile. */
    @Column(nullable = false, length = 20)
    private String phone;

    /** Optional contact email (lowercased), null when not provided. */
    @Column(length = 255)
    private String email;

    /** 6-digit Indian pincode the visitor entered (location capture). */
    @Column(length = 6)
    private String pincode;

    /** City resolved from the pincode (district, or the state capital as fallback); user-editable. */
    @Column(length = 128)
    private String city;

    /** State/UT resolved from the pincode; user-editable. */
    @Column(length = 128)
    private String state;

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

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
