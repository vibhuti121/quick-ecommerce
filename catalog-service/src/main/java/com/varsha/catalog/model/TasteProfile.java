package com.varsha.catalog.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The account-side mirror of the Taste Match game's per-device progression (V7). One row per
 * authenticated account, keyed by the auth user id (Google "sub" / "usr-&lt;uuid&gt;"). The storefront
 * keeps localStorage as the offline/guest truth; this row survives across devices once a player signs
 * in. On login the device snapshot is merged in (union of collectibles, max of XP/streak) so nothing
 * earned as a guest is lost — the guest-cart carry-over invariant, applied to the game.
 *
 * <p>ddl-auto is {@code validate}, so every column here must match V7__taste_profile.sql exactly or the
 * service crash-loops at boot. jsonb columns use {@code @JdbcTypeCode(SqlTypes.JSON)} — the same idiom
 * as {@link Product#getAttributes()}.
 */
@Entity
@Table(name = "taste_profile")
public class TasteProfile {

    @Id
    @Column(name = "user_id", length = 255)
    private String userId;

    @Column(nullable = false)
    private int xp = 0;

    @Column(columnDefinition = "text")
    private String tier;

    @Column(name = "rank")
    private Integer rank;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "discovered_fruits", nullable = false, columnDefinition = "jsonb")
    private List<String> discoveredFruits = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<String> badges = new ArrayList<>();

    @Column(nullable = false)
    private int streak = 0;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "fruit_affinity", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> fruitAffinity = new LinkedHashMap<>();

    @Column(columnDefinition = "text")
    private String persona;

    @Column(length = 128)
    private String state;

    @Column(length = 6)
    private String pincode;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public int getXp() { return xp; }
    public void setXp(int xp) { this.xp = xp; }

    public String getTier() { return tier; }
    public void setTier(String tier) { this.tier = tier; }

    public Integer getRank() { return rank; }
    public void setRank(Integer rank) { this.rank = rank; }

    public List<String> getDiscoveredFruits() { return discoveredFruits; }
    public void setDiscoveredFruits(List<String> discoveredFruits) { this.discoveredFruits = discoveredFruits; }

    public List<String> getBadges() { return badges; }
    public void setBadges(List<String> badges) { this.badges = badges; }

    public int getStreak() { return streak; }
    public void setStreak(int streak) { this.streak = streak; }

    public Map<String, Object> getFruitAffinity() { return fruitAffinity; }
    public void setFruitAffinity(Map<String, Object> fruitAffinity) { this.fruitAffinity = fruitAffinity; }

    public String getPersona() { return persona; }
    public void setPersona(String persona) { this.persona = persona; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
