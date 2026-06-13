package com.varsha.catalog.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

/**
 * The progress snapshot the storefront sends up — either as the upsert body (POST
 * /api/catalog/taste/profile, a {@code Partial<DeviceTasteProgress>}) or wrapped inside
 * {@link TasteMergeRequest#deviceProgress()} for the device→account merge.
 *
 * <p>It is LENIENT by design (all fields optional, unknown fields ignored): the device sends
 * {@code currentStreak}/{@code bestStreak} (no single "streak"); the FE TasteProfile carries
 * {@code tier}/{@code rank} that the device snapshot lacks. We accept every variant and reconcile in
 * the service — a partial body must never 400 a best-effort sync (the FE swallows failures, so a 400
 * would silently lose progress).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TasteProgressUpdate(
        Integer xp,
        String tier,
        Integer rank,
        List<String> discoveredFruits,
        List<String> badges,
        Integer streak,
        Integer currentStreak,
        Integer bestStreak,
        Map<String, Object> fruitAffinity,
        String persona,
        String state,
        String pincode) {

    /** The streak the FE means: an explicit "streak", else the device's currentStreak, else null. */
    public Integer effectiveStreak() {
        if (streak != null) return streak;
        return currentStreak;
    }
}
