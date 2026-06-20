package com.varsha.catalog.service;

import com.varsha.catalog.dto.FruitXiTeam;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Static registry of WC-2026 teams and supporting lookup tables.
 *
 * <p>All fields are immutable constants — no DB table, no Flyway migration.
 *
 * <h3>Colour bucket resolution</h3>
 * <ol>
 *   <li>Check {@code attributes.kitColor} or {@code attributes.color} against the
 *       {@link ColourBucket} enum (case-insensitive).</li>
 *   <li>Check the fruit name (lowercased) against {@link #KEYWORD_BUCKET_MAP}.</li>
 *   <li>Fall back to {@code UNCLASSIFIED}.</li>
 * </ol>
 *
 * <h3>Hex-to-bucket mapping</h3>
 * {@link #HEX_TO_BUCKET} maps representative kit-colour hex codes (as stored in each team entry)
 * to a {@link ColourBucket}. The lookup is an exact-match constant — NOT a live distance
 * calculation. If a hex is not in the map the bucket defaults to {@code UNCLASSIFIED}.
 */
public final class FruitXiTeams {

    private FruitXiTeams() {}

    // ── Colour bucket enum ──────────────────────────────────────────────────

    public enum ColourBucket {
        RED, ORANGE, YELLOW, GREEN, PURPLE, WHITE, UNCLASSIFIED;

        /** Parse from attribute value; returns empty if not a recognised bucket name. */
        public static Optional<ColourBucket> parse(Object raw) {
            if (raw == null) return Optional.empty();
            try {
                return Optional.of(ColourBucket.valueOf(raw.toString().trim().toUpperCase()));
            } catch (IllegalArgumentException e) {
                return Optional.empty();
            }
        }
    }

    // ── Static team registry ────────────────────────────────────────────────

    public static final List<FruitXiTeam> ALL = List.of(
        new FruitXiTeam("BRA", "Brazil",       "🇧🇷", "#F7D600", "#009C3B"),
        new FruitXiTeam("ARG", "Argentina",    "🇦🇷", "#74ACDF", "#FFFFFF"),
        new FruitXiTeam("ENG", "England",      "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "#FFFFFF", "#CC0000"),
        new FruitXiTeam("FRA", "France",       "🇫🇷", "#002395", "#FFFFFF"),
        new FruitXiTeam("GER", "Germany",      "🇩🇪", "#FFFFFF", "#000000"),
        new FruitXiTeam("ESP", "Spain",        "🇪🇸", "#AA151B", "#F1BF00"),
        new FruitXiTeam("POR", "Portugal",     "🇵🇹", "#006600", "#FF0000"),
        new FruitXiTeam("ITA", "Italy",        "🇮🇹", "#003399", "#FFFFFF"),
        new FruitXiTeam("NED", "Netherlands",  "🇳🇱", "#FF6600", "#FFFFFF"),
        new FruitXiTeam("BEL", "Belgium",      "🇧🇪", "#000000", "#F50000"),
        new FruitXiTeam("CRO", "Croatia",      "🇭🇷", "#FF0000", "#FFFFFF"),
        new FruitXiTeam("URU", "Uruguay",      "🇺🇾", "#74ACDF", "#FFFFFF"),
        new FruitXiTeam("MEX", "Mexico",       "🇲🇽", "#006847", "#FFFFFF"),
        new FruitXiTeam("USA", "United States","🇺🇸", "#FFFFFF", "#B22234"),
        new FruitXiTeam("JPN", "Japan",        "🇯🇵", "#FFFFFF", "#BC002D"),
        new FruitXiTeam("KOR", "South Korea",  "🇰🇷", "#FFFFFF", "#003478"),
        new FruitXiTeam("SEN", "Senegal",      "🇸🇳", "#00853F", "#FDEF42"),
        new FruitXiTeam("MAR", "Morocco",      "🇲🇦", "#C1272D", "#006233"),
        new FruitXiTeam("AUS", "Australia",    "🇦🇺", "#003087", "#FFD700"),
        new FruitXiTeam("IND", "India",        "🇮🇳", "#FF9933", "#138808")
    );

    // Fast lookup by team code (immutable, computed once)
    private static final Map<String, FruitXiTeam> BY_CODE = ALL.stream()
            .collect(Collectors.toUnmodifiableMap(FruitXiTeam::code, Function.identity()));

    public static Optional<FruitXiTeam> findByCode(String code) {
        if (code == null || code.isBlank()) return Optional.empty();
        return Optional.ofNullable(BY_CODE.get(code.trim().toUpperCase()));
    }

    // ── Hex-to-bucket lookup (exact match, NOT a distance calc) ────────────

    /**
     * Maps a colorPrimary or colorSecondary hex (as stored in ALL teams) to a ColourBucket.
     * Only the hex values actually present in the registry are listed; unknowns default to UNCLASSIFIED.
     */
    public static final Map<String, ColourBucket> HEX_TO_BUCKET = Map.ofEntries(
        // Yellows
        Map.entry("#F7D600", ColourBucket.YELLOW),
        Map.entry("#F1BF00", ColourBucket.YELLOW),
        Map.entry("#FFD700", ColourBucket.YELLOW),
        Map.entry("#FDEF42", ColourBucket.YELLOW),
        // Oranges
        Map.entry("#FF6600", ColourBucket.ORANGE),
        Map.entry("#FF9933", ColourBucket.ORANGE),
        // Reds
        Map.entry("#CC0000", ColourBucket.RED),
        Map.entry("#F50000", ColourBucket.RED),
        Map.entry("#FF0000", ColourBucket.RED),
        Map.entry("#BC002D", ColourBucket.RED),
        Map.entry("#C1272D", ColourBucket.RED),
        Map.entry("#AA151B", ColourBucket.RED),
        Map.entry("#B22234", ColourBucket.RED),
        // Greens
        Map.entry("#009C3B", ColourBucket.GREEN),
        Map.entry("#006847", ColourBucket.GREEN),
        Map.entry("#006600", ColourBucket.GREEN),
        Map.entry("#006233", ColourBucket.GREEN),
        Map.entry("#00853F", ColourBucket.GREEN),
        Map.entry("#138808", ColourBucket.GREEN),
        // Blues → PURPLE (closest available bucket for cool blues)
        Map.entry("#74ACDF", ColourBucket.PURPLE),
        Map.entry("#003478", ColourBucket.PURPLE),
        Map.entry("#003099", ColourBucket.PURPLE),
        Map.entry("#002395", ColourBucket.PURPLE),
        Map.entry("#003087", ColourBucket.PURPLE),
        // Whites
        Map.entry("#FFFFFF", ColourBucket.WHITE),
        // Blacks / near-black
        Map.entry("#000000", ColourBucket.UNCLASSIFIED)
    );

    public static ColourBucket bucketForHex(String hex) {
        if (hex == null) return ColourBucket.UNCLASSIFIED;
        return HEX_TO_BUCKET.getOrDefault(hex.trim().toUpperCase(), ColourBucket.UNCLASSIFIED);
    }

    // ── Keyword-to-bucket map (lowercased name substring / exact match) ─────

    /**
     * Maps a lowercased fruit name keyword to a colour bucket.
     * First match in iteration order wins (Map.of has no guaranteed order; use ordered lookup list).
     * Seeds from the real seeded SKU names in this catalogue.
     */
    public static final List<Map.Entry<String, ColourBucket>> KEYWORD_BUCKET_RULES = List.of(
        // RED fruits
        Map.entry("litchi",    ColourBucket.RED),
        Map.entry("lychee",    ColourBucket.RED),
        Map.entry("strawberry",ColourBucket.RED),
        Map.entry("cherry",    ColourBucket.RED),
        Map.entry("watermelon",ColourBucket.RED),
        Map.entry("pomegranate",ColourBucket.RED),
        // ORANGE fruits
        Map.entry("alphonso",  ColourBucket.ORANGE),
        Map.entry("mango",     ColourBucket.ORANGE),
        Map.entry("orange",    ColourBucket.ORANGE),
        Map.entry("papaya",    ColourBucket.ORANGE),
        Map.entry("peach",     ColourBucket.ORANGE),
        Map.entry("apricot",   ColourBucket.ORANGE),
        Map.entry("tangerine", ColourBucket.ORANGE),
        // YELLOW fruits
        Map.entry("banana",    ColourBucket.YELLOW),
        Map.entry("pineapple", ColourBucket.YELLOW),
        Map.entry("lemon",     ColourBucket.YELLOW),
        Map.entry("jackfruit", ColourBucket.YELLOW),
        Map.entry("starfruit", ColourBucket.YELLOW),
        // GREEN fruits
        Map.entry("kiwi",      ColourBucket.GREEN),
        Map.entry("avocado",   ColourBucket.GREEN),
        Map.entry("guava",     ColourBucket.GREEN),
        Map.entry("lime",      ColourBucket.GREEN),
        Map.entry("pear",      ColourBucket.GREEN),
        Map.entry("gooseberry",ColourBucket.GREEN),
        // PURPLE fruits
        Map.entry("grape",     ColourBucket.PURPLE),
        Map.entry("blueberry", ColourBucket.PURPLE),
        Map.entry("blackberry",ColourBucket.PURPLE),
        Map.entry("plum",      ColourBucket.PURPLE),
        Map.entry("fig",       ColourBucket.PURPLE),
        Map.entry("jamun",     ColourBucket.PURPLE),
        // WHITE fruits
        Map.entry("coconut",   ColourBucket.WHITE),
        Map.entry("lychee white",ColourBucket.WHITE),
        Map.entry("rambutan",  ColourBucket.WHITE),
        Map.entry("mangosteen",ColourBucket.WHITE)
    );

    /**
     * Resolve a fruit name to a colour bucket via the keyword rules.
     * Returns empty if no keyword matched (caller should fall back to UNCLASSIFIED).
     */
    public static Optional<ColourBucket> bucketByKeyword(String fruitName) {
        if (fruitName == null) return Optional.empty();
        String lower = fruitName.trim().toLowerCase();
        for (Map.Entry<String, ColourBucket> rule : KEYWORD_BUCKET_RULES) {
            if (lower.contains(rule.getKey())) {
                return Optional.of(rule.getValue());
            }
        }
        return Optional.empty();
    }
}
