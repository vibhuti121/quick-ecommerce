package com.varsha.catalog.service;

import com.varsha.catalog.dto.TasteProfileResponse;
import com.varsha.catalog.dto.TasteProgressUpdate;
import com.varsha.catalog.model.TasteProfile;
import com.varsha.catalog.repository.TasteProfileRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Persists the Taste Match account profile (V7). The carry-over invariant — nothing a player earned is
 * lost — is enforced here: both the upsert and the merge are MONOTONIC on the cumulative fields
 * (union of discovered fruits + badges, max of XP + streak) and latest-wins on the descriptive ones
 * (tier/rank/persona/state/pincode/affinity). So a stale device snapshot can never lower a player's XP
 * or drop a collectible, mirroring the guest-cart carry-over spirit.
 */
@Service
@Transactional
public class TasteProfileService {

    private final TasteProfileRepository repo;

    public TasteProfileService(TasteProfileRepository repo) {
        this.repo = repo;
    }

    /** GET — the account's profile, or a zeroed default if none yet (never 404, the FE expects a body). */
    @Transactional(readOnly = true)
    public TasteProfileResponse get(String userId) {
        return repo.findById(userId)
                .map(TasteProfileResponse::from)
                .orElseGet(TasteProfileResponse::empty);
    }

    /**
     * Upsert after a logged-in run. Monotonic merge of the incoming snapshot into the stored row, so a
     * partial/out-of-order best-effort sync can only ever grow the profile.
     */
    public TasteProfileResponse upsert(String userId, TasteProgressUpdate in) {
        TasteProfile p = repo.findById(userId).orElseGet(() -> {
            TasteProfile fresh = new TasteProfile();
            fresh.setUserId(userId);
            return fresh;
        });
        apply(p, in);
        return TasteProfileResponse.from(repo.save(p));
    }

    /**
     * Device→account merge on login. Identical monotonic semantics to upsert: the device snapshot is
     * folded into whatever the account already has, so neither side loses anything earned.
     */
    public TasteProfileResponse merge(String userId, TasteProgressUpdate device) {
        return upsert(userId, device);
    }

    /** Fold {@code in} into {@code p}: union collections, max counters, latest-wins descriptors. */
    private void apply(TasteProfile p, TasteProgressUpdate in) {
        if (in == null) return;

        if (in.xp() != null) p.setXp(Math.max(p.getXp(), in.xp()));

        Integer streak = in.effectiveStreak();
        if (streak != null) p.setStreak(Math.max(p.getStreak(), streak));

        p.setDiscoveredFruits(union(p.getDiscoveredFruits(), in.discoveredFruits()));
        p.setBadges(union(p.getBadges(), in.badges()));

        // Latest-wins descriptors — only overwrite when the snapshot actually carries a value, so a
        // partial upsert (e.g. footprint-only) doesn't wipe a previously-set tier/persona.
        if (notBlank(in.tier())) p.setTier(in.tier());
        if (in.rank() != null) p.setRank(in.rank());
        if (notBlank(in.persona())) p.setPersona(in.persona());
        if (notBlank(in.state())) p.setState(in.state());
        if (notBlank(in.pincode())) p.setPincode(in.pincode());
        if (in.fruitAffinity() != null && !in.fruitAffinity().isEmpty()) {
            // Latest-wins per key, but keep any keys the new snapshot omits (merge, don't replace).
            Map<String, Object> merged = new LinkedHashMap<>(p.getFruitAffinity());
            merged.putAll(in.fruitAffinity());
            p.setFruitAffinity(merged);
        }
    }

    /** Order-preserving union of two slug lists (case-insensitive de-dupe, blanks dropped). */
    private static List<String> union(List<String> existing, List<String> incoming) {
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        List<String> out = new ArrayList<>();
        addAll(existing, seen, out);
        addAll(incoming, seen, out);
        return out;
    }

    private static void addAll(List<String> src, LinkedHashSet<String> seen, List<String> out) {
        if (src == null) return;
        for (String s : src) {
            if (s == null) continue;
            String slug = s.trim();
            if (!slug.isEmpty() && seen.add(slug.toLowerCase())) out.add(slug);
        }
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
