package com.varsha.catalog.service;

import com.varsha.catalog.dto.AutofillResponse;
import com.varsha.catalog.dto.FruitBoxItem;
import com.varsha.catalog.dto.FruitBoxResponse;
import com.varsha.catalog.dto.FruitXiTeam;
import com.varsha.catalog.exception.EmptyLineupException;
import com.varsha.catalog.exception.UnknownTeamException;
import com.varsha.catalog.model.Product;
import com.varsha.catalog.repository.ProductRepository;
import com.varsha.catalog.service.FruitXiTeams.ColourBucket;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Business logic for the Fruit XI fan-box feature.
 *
 * <h3>Key invariants (mirror the sysdesign contract):</h3>
 * <ul>
 *   <li>Honey exclusion: category == "honey" (case-insensitive) → HONEY_NOT_BUYABLE.</li>
 *   <li>Dedupe by productId — keep first occurrence, later dupes → DUPLICATE.</li>
 *   <li>Missing / inactive ids → NOT_FOUND_OR_INACTIVE (dropped silently from items).</li>
 *   <li>Unknown team → 400 UnknownTeamException.</li>
 *   <li>Null / empty lineup → 400 EmptyLineupException (distinct from 200-empty-items).</li>
 *   <li>Autofill is fully deterministic for same team + same catalogue state.</li>
 * </ul>
 *
 * <p>No cache dependency — these reads are ad-hoc fan-box compositions, not the high-frequency
 * browse path. Low risk of hotspot even at pilot scale.
 */
@Service
public class FruitXiService {

    private static final int AUTOFILL_TARGET = 11;
    private static final String HONEY_CATEGORY = "honey";
    private static final String FRUIT_CATEGORY = "fruit";

    private final ProductRepository productRepository;

    public FruitXiService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    // ── /teams ────────────────────────────────────────────────────────────────

    public List<FruitXiTeam> listTeams() {
        return FruitXiTeams.ALL;
    }

    // ── /box ──────────────────────────────────────────────────────────────────

    /**
     * Compose a fan box from the caller-supplied lineup.
     *
     * @param teamCode team code (case-insensitive); unknown → 400
     * @param lineup   ordered product ids (null/empty → 400)
     */
    @Transactional(readOnly = true)
    public FruitBoxResponse composeBox(String teamCode, List<Long> lineup) {
        // Validate team
        FruitXiTeam team = FruitXiTeams.findByCode(teamCode)
                .orElseThrow(() -> new UnknownTeamException(teamCode));

        // Validate lineup
        if (lineup == null || lineup.isEmpty()) {
            throw new EmptyLineupException();
        }

        // Resolve active products in one query
        List<Product> resolved = productRepository.findByIdInAndActiveTrue(lineup);
        Map<Long, Product> byId = resolved.stream()
                .collect(Collectors.toMap(Product::getId, p -> p));

        List<FruitBoxItem> items = new ArrayList<>();
        List<FruitBoxResponse.ExcludedItem> excluded = new ArrayList<>();
        Set<Long> seen = new LinkedHashSet<>();

        for (Long id : lineup) {
            if (!seen.add(id)) {
                // Duplicate — keep first occurrence, mark later as DUPLICATE
                excluded.add(new FruitBoxResponse.ExcludedItem(id, "DUPLICATE"));
                continue;
            }

            Product p = byId.get(id);
            if (p == null) {
                // Missing or inactive
                excluded.add(new FruitBoxResponse.ExcludedItem(id, "NOT_FOUND_OR_INACTIVE"));
                continue;
            }

            if (HONEY_CATEGORY.equalsIgnoreCase(p.getCategory())) {
                // Honey — not buyable per cart-service invariant
                excluded.add(new FruitBoxResponse.ExcludedItem(id, "HONEY_NOT_BUYABLE"));
                continue;
            }

            items.add(toBoxItem(p));
        }

        BigDecimal total = items.stream()
                .map(FruitBoxItem::basePrice)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new FruitBoxResponse(team.code(), items, excluded, total);
    }

    // ── /autofill ─────────────────────────────────────────────────────────────

    /**
     * Deterministically fill an 11-slot fan box for the given team using active non-honey fruits,
     * colour-matched to the team's kit.
     *
     * <p>Algorithm (§8-SAFE — set membership + stable id tiebreak, NO weighted score):
     * <ol>
     *   <li>Pool = all active fruits (category='fruit'), sorted by id ASC for stable ordering.</li>
     *   <li>Assign each fruit a colour bucket (attribute → keyword → UNCLASSIFIED).</li>
     *   <li>Derive team's ordered bucket preference from kit colours (primary then secondary hex).</li>
     *   <li>Fill: primary bucket first (id order), secondary, remaining buckets in enum order,
     *       UNCLASSIFIED last; stop at 11; no duplication.</li>
     * </ol>
     *
     * @param teamCode team code; unknown → 400
     */
    @Transactional(readOnly = true)
    public AutofillResponse autofill(String teamCode) {
        FruitXiTeam team = FruitXiTeams.findByCode(teamCode)
                .orElseThrow(() -> new UnknownTeamException(teamCode));

        // Pool: active fruits sorted by id ASC (stable, deterministic). The derived query
        // already enforces category='fruit' case-insensitively; the honey filter is a
        // belt-and-suspenders guard for any accidental category collision.
        List<Product> pool = productRepository
                .findByActiveTrueAndCategoryIgnoreCaseOrderByIdAsc(FRUIT_CATEGORY)
                .stream()
                .filter(p -> !HONEY_CATEGORY.equalsIgnoreCase(p.getCategory()))
                .collect(Collectors.toList());

        // Assign each fruit its colour bucket
        record FruitWithBucket(Product product, ColourBucket bucket, String explain) {}
        List<FruitWithBucket> annotated = pool.stream()
                .map(p -> {
                    // Rule 1: attributes.kitColor / attributes.color
                    Map<String, Object> attrs = p.getAttributes();
                    if (attrs != null) {
                        Optional<ColourBucket> fromAttr = ColourBucket.parse(attrs.get("kitColor"));
                        if (fromAttr.isPresent()) {
                            return new FruitWithBucket(p, fromAttr.get(), "attribute:kitColor");
                        }
                        fromAttr = ColourBucket.parse(attrs.get("color"));
                        if (fromAttr.isPresent()) {
                            return new FruitWithBucket(p, fromAttr.get(), "attribute:color");
                        }
                    }
                    // Rule 2: keyword match on name
                    Optional<ColourBucket> fromKeyword = FruitXiTeams.bucketByKeyword(p.getName());
                    if (fromKeyword.isPresent()) {
                        return new FruitWithBucket(p, fromKeyword.get(),
                                "keyword:" + p.getName().trim().toLowerCase());
                    }
                    // Rule 3: UNCLASSIFIED
                    return new FruitWithBucket(p, ColourBucket.UNCLASSIFIED, "unclassified");
                })
                .collect(Collectors.toList());

        // Bucket groups (preserving id-ASC order within each bucket)
        Map<ColourBucket, List<FruitWithBucket>> byBucket = new LinkedHashMap<>();
        for (ColourBucket b : ColourBucket.values()) {
            byBucket.put(b, new ArrayList<>());
        }
        for (FruitWithBucket f : annotated) {
            byBucket.get(f.bucket()).add(f);
        }

        // Team's ordered bucket preference
        ColourBucket primary = FruitXiTeams.bucketForHex(team.colorPrimary());
        ColourBucket secondary = FruitXiTeams.bucketForHex(team.colorSecondary());

        // Pick order: [primary, secondary, remaining enum order (excl. UNCLASSIFIED), UNCLASSIFIED last]
        List<ColourBucket> pickOrder = new ArrayList<>();
        pickOrder.add(primary);
        if (secondary != primary) {
            pickOrder.add(secondary);
        }
        for (ColourBucket b : ColourBucket.values()) {
            if (b != primary && b != secondary && b != ColourBucket.UNCLASSIFIED) {
                pickOrder.add(b);
            }
        }
        pickOrder.add(ColourBucket.UNCLASSIFIED);

        // Fill up to 11, dedupe by product id
        List<AutofillResponse.AutofillItem> items = new ArrayList<>();
        Set<Long> used = new LinkedHashSet<>();

        for (ColourBucket bucket : pickOrder) {
            if (items.size() >= AUTOFILL_TARGET) break;
            for (FruitWithBucket f : byBucket.get(bucket)) {
                if (items.size() >= AUTOFILL_TARGET) break;
                if (used.add(f.product().getId())) {
                    items.add(toAutofillItem(f.product(), f.bucket(), f.explain()));
                }
            }
        }

        return new AutofillResponse(team.code(), AUTOFILL_TARGET, items.size(), items);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static FruitBoxItem toBoxItem(Product p) {
        return new FruitBoxItem(
                p.getId(),
                p.getSku(),
                p.getName(),
                p.getBasePrice(),
                p.getCurrency(),
                p.getImageUrl(),
                1
        );
    }

    private static AutofillResponse.AutofillItem toAutofillItem(Product p, ColourBucket bucket,
                                                                 String explain) {
        return new AutofillResponse.AutofillItem(
                p.getId(),
                p.getSku(),
                p.getName(),
                p.getBasePrice(),
                p.getCurrency(),
                p.getImageUrl(),
                bucket.name(),
                explain
        );
    }
}
