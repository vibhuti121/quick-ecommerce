package com.varsha.catalog.dto;

import com.varsha.catalog.model.TasteProfile;

import java.util.List;
import java.util.Map;

/**
 * The account's taste profile as the storefront reads it (GET / upsert / merge all return this).
 * Field names match the frontend {@code TasteProfile} type exactly:
 * {xp, tier, rank, discoveredFruits[], badges[], streak, persona, state, pincode}, plus the
 * {@code fruitAffinity} map the device sends. A null/absent field on the FE degrades to localStorage,
 * so an empty/zeroed default (never a 404) is a valid "no profile yet" answer.
 */
public record TasteProfileResponse(
        int xp,
        String tier,
        Integer rank,
        List<String> discoveredFruits,
        List<String> badges,
        int streak,
        Map<String, Object> fruitAffinity,
        String persona,
        String state,
        String pincode) {

    public static TasteProfileResponse from(TasteProfile p) {
        return new TasteProfileResponse(
                p.getXp(),
                p.getTier(),
                p.getRank(),
                p.getDiscoveredFruits(),
                p.getBadges(),
                p.getStreak(),
                p.getFruitAffinity(),
                p.getPersona(),
                p.getState(),
                p.getPincode());
    }

    /** The zeroed default returned when an account has no profile yet (the FE expects a body, not 404). */
    public static TasteProfileResponse empty() {
        return new TasteProfileResponse(0, null, null, List.of(), List.of(), 0, Map.of(), null, null, null);
    }
}
