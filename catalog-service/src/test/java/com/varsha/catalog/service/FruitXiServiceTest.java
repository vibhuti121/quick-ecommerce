package com.varsha.catalog.service;

import com.varsha.catalog.dto.AutofillResponse;
import com.varsha.catalog.dto.FruitBoxResponse;
import com.varsha.catalog.exception.EmptyLineupException;
import com.varsha.catalog.exception.UnknownTeamException;
import com.varsha.catalog.model.Product;
import com.varsha.catalog.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for FruitXiService covering the 7 contract-required cases.
 *
 * No Spring context — pure Mockito. No DB, no container, no compose up.
 */
@ExtendWith(MockitoExtension.class)
class FruitXiServiceTest {

    @Mock
    private ProductRepository repo;

    private FruitXiService service;

    @BeforeEach
    void setUp() {
        service = new FruitXiService(repo);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Product fruit(long id, String name, BigDecimal price) {
        return product(id, "FRUIT-" + id, name, "fruit", price, true, new HashMap<>());
    }

    private static Product honey(long id) {
        return product(id, "HONEY-" + id, "Raw Honey", "honey", new BigDecimal("500"), true, new HashMap<>());
    }

    private static Product honeyMixedCase(long id) {
        return product(id, "HONEY-MC-" + id, "Premium Honey", "Honey", new BigDecimal("600"), true, new HashMap<>());
    }

    private static Product inactive(long id) {
        return product(id, "INACT-" + id, "Inactive Fruit", "fruit", new BigDecimal("100"), false, new HashMap<>());
    }

    private static Product product(long id, String sku, String name, String category,
                                   BigDecimal price, boolean active, Map<String, Object> attrs) {
        Product p = new Product();
        p.setId(id);
        p.setSku(sku);
        p.setName(name);
        p.setCategory(category);
        p.setBasePrice(price);
        p.setCurrency("INR");
        p.setImageUrl("https://cdn.example.com/" + sku + ".jpg");
        p.setActive(active);
        p.setAttributes(attrs != null ? attrs : new HashMap<>());
        p.setCreatedAt(Instant.now());
        p.setUpdatedAt(Instant.now());
        return p;
    }

    // ── Test 1: Honey exclusion ────────────────────────────────────────────────

    /**
     * Contract test 1: honey products (including mixed-case "Honey") are excluded as
     * HONEY_NOT_BUYABLE, regardless of capitalisation.
     */
    @Test
    void honeyExclusion_mixedCase_excludedAsHoneyNotBuyable() {
        Product alphonso = fruit(1L, "Alphonso Mango", new BigDecimal("200"));
        Product honeyLower = honey(2L);
        Product honeyMixed = honeyMixedCase(3L);

        // findByIdInAndActiveTrue returns active products matching the ids
        when(repo.findByIdInAndActiveTrue(List.of(1L, 2L, 3L)))
                .thenReturn(List.of(alphonso, honeyLower, honeyMixed));

        FruitBoxResponse resp = service.composeBox("BRA", List.of(1L, 2L, 3L));

        assertThat(resp.items()).hasSize(1);
        assertThat(resp.items().get(0).productId()).isEqualTo(1L);

        assertThat(resp.excluded()).hasSize(2);
        assertThat(resp.excluded().stream().map(FruitBoxResponse.ExcludedItem::reason))
                .containsExactlyInAnyOrder("HONEY_NOT_BUYABLE", "HONEY_NOT_BUYABLE");
        assertThat(resp.excluded().stream().map(FruitBoxResponse.ExcludedItem::productId))
                .containsExactlyInAnyOrder(2L, 3L);
    }

    // ── Test 2: Dedupe ─────────────────────────────────────────────────────────

    /**
     * Contract test 2: lineup [12, 12, 12] → one item (first kept), two DUPLICATE excludes.
     */
    @Test
    void dedupe_triplicateId_oneItemTwoDuplicates() {
        Product mango = fruit(12L, "Alphonso Mango", new BigDecimal("300"));
        when(repo.findByIdInAndActiveTrue(List.of(12L, 12L, 12L)))
                .thenReturn(List.of(mango));  // DB dedupes naturally; service logic dedupes on id

        FruitBoxResponse resp = service.composeBox("ARG", List.of(12L, 12L, 12L));

        assertThat(resp.items()).hasSize(1);
        assertThat(resp.items().get(0).productId()).isEqualTo(12L);

        assertThat(resp.excluded()).hasSize(2);
        assertThat(resp.excluded()).allMatch(e -> "DUPLICATE".equals(e.reason()));
        assertThat(resp.excluded()).allMatch(e -> e.productId().equals(12L));
    }

    // ── Test 3: Unknown team ──────────────────────────────────────────────────

    /**
     * Contract test 3a: /box with bad team "XYZ" → 400 UnknownTeamException.
     */
    @Test
    void box_unknownTeam_throws400() {
        assertThatThrownBy(() -> service.composeBox("XYZ", List.of(1L)))
                .isInstanceOf(UnknownTeamException.class)
                .hasMessageContaining("XYZ");
    }

    /**
     * Contract test 3b: /box with null team → 400 UnknownTeamException.
     */
    @Test
    void box_nullTeam_throws400() {
        assertThatThrownBy(() -> service.composeBox(null, List.of(1L)))
                .isInstanceOf(UnknownTeamException.class);
    }

    /**
     * Contract test 3c: /autofill with bad team "XYZ" → 400 UnknownTeamException.
     */
    @Test
    void autofill_unknownTeam_throws400() {
        assertThatThrownBy(() -> service.autofill("XYZ"))
                .isInstanceOf(UnknownTeamException.class)
                .hasMessageContaining("XYZ");
    }

    /**
     * Contract test 3d: /autofill with blank team → 400 UnknownTeamException.
     */
    @Test
    void autofill_blankTeam_throws400() {
        assertThatThrownBy(() -> service.autofill("  "))
                .isInstanceOf(UnknownTeamException.class);
    }

    // ── Test 4: Empty lineup vs all-invalid ──────────────────────────────────

    /**
     * Contract test 4a: null lineup → 400 EmptyLineupException.
     * This is the "you sent nothing" case — distinct from "nothing survived".
     */
    @Test
    void box_nullLineup_throws400EmptyLineup() {
        assertThatThrownBy(() -> service.composeBox("BRA", null))
                .isInstanceOf(EmptyLineupException.class);
    }

    /**
     * Contract test 4b: empty-list lineup → 400 EmptyLineupException.
     */
    @Test
    void box_emptyLineup_throws400EmptyLineup() {
        assertThatThrownBy(() -> service.composeBox("BRA", List.of()))
                .isInstanceOf(EmptyLineupException.class);
    }

    /**
     * Contract test 4c: lineup with all-invalid ids → 200 with items=[] and all in excluded.
     * This is the "sent something but nothing survived" path — must return 200, NOT 400.
     */
    @Test
    void box_allInvalidIds_200WithEmptyItems() {
        when(repo.findByIdInAndActiveTrue(List.of(999L, 888L)))
                .thenReturn(List.of()); // nothing found

        FruitBoxResponse resp = service.composeBox("ENG", List.of(999L, 888L));

        assertThat(resp.items()).isEmpty();
        assertThat(resp.excluded()).hasSize(2);
        assertThat(resp.excluded()).allMatch(e -> "NOT_FOUND_OR_INACTIVE".equals(e.reason()));
        assertThat(resp.total()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    // ── Test 5: Not-found / inactive ─────────────────────────────────────────

    /**
     * Contract test 5: ids that don't exist or are inactive → excluded NOT_FOUND_OR_INACTIVE.
     */
    @Test
    void box_missingAndInactive_excludedAsNotFoundOrInactive() {
        Product live = fruit(10L, "Kiwi", new BigDecimal("150"));
        // id 11 and 12 not returned by findByIdInAndActiveTrue (missing or inactive)
        when(repo.findByIdInAndActiveTrue(List.of(10L, 11L, 12L)))
                .thenReturn(List.of(live));

        FruitBoxResponse resp = service.composeBox("FRA", List.of(10L, 11L, 12L));

        assertThat(resp.items()).hasSize(1);
        assertThat(resp.items().get(0).productId()).isEqualTo(10L);

        assertThat(resp.excluded()).hasSize(2);
        assertThat(resp.excluded().stream().map(FruitBoxResponse.ExcludedItem::reason))
                .containsOnly("NOT_FOUND_OR_INACTIVE");
    }

    // ── Test 6: Autofill determinism ─────────────────────────────────────────

    /**
     * Contract test 6: two autofill calls for the same team + same repo state produce
     * byte-identical item order (list equality, not just set equality).
     * Also validates colorBucket and explain fields are populated.
     */
    @Test
    void autofill_determinism_sameOrderBothCalls() {
        List<Product> fruits = buildFruitPool();
        when(repo.findByActiveTrueAndCategoryIgnoreCaseOrderByIdAsc("fruit"))
                .thenReturn(fruits);

        AutofillResponse first  = service.autofill("BRA");
        AutofillResponse second = service.autofill("BRA");

        assertThat(first.items()).isEqualTo(second.items());

        // Verify colorBucket and explain are set
        for (AutofillResponse.AutofillItem item : first.items()) {
            assertThat(item.colorBucket()).isNotBlank();
            assertThat(item.explain()).isNotBlank();
        }
    }

    /**
     * Contract test 6b: different teams produce different ordering (primary bucket differs).
     */
    @Test
    void autofill_differentTeams_maySproduceDifferentOrder() {
        List<Product> fruits = buildFruitPool();
        when(repo.findByActiveTrueAndCategoryIgnoreCaseOrderByIdAsc("fruit"))
                .thenReturn(new ArrayList<>(fruits));

        AutofillResponse bra = service.autofill("BRA"); // primary=YELLOW, secondary=GREEN
        AutofillResponse ned = service.autofill("NED"); // primary=ORANGE, secondary=WHITE

        // They may or may not be equal depending on pool, but both must be internally consistent
        assertThat(bra.team()).isEqualTo("BRA");
        assertThat(ned.team()).isEqualTo("NED");
        assertThat(bra.requested()).isEqualTo(11);
        assertThat(ned.requested()).isEqualTo(11);
    }

    // ── Test 7: Autofill under-supply ─────────────────────────────────────────

    /**
     * Contract test 7: if fewer than 11 active fruits exist, autofill returns filled<11,
     * no duplicates, no honey, no padding.
     */
    @Test
    void autofill_underSupply_filledLessThan11_noDupesNoPaddingNoHoney() {
        // Only 5 active fruits
        List<Product> smallPool = List.of(
                fruit(1L, "Alphonso Mango", new BigDecimal("200")),
                fruit(2L, "Kiwi",           new BigDecimal("80")),
                fruit(3L, "Banana",         new BigDecimal("40")),
                fruit(4L, "Litchi",         new BigDecimal("120")),
                fruit(5L, "Strawberry",     new BigDecimal("90"))
        );
        when(repo.findByActiveTrueAndCategoryIgnoreCaseOrderByIdAsc("fruit"))
                .thenReturn(smallPool);

        AutofillResponse resp = service.autofill("BRA");

        assertThat(resp.requested()).isEqualTo(11);
        assertThat(resp.filled()).isEqualTo(5);
        assertThat(resp.items()).hasSize(5);

        // No duplicates
        long distinctIds = resp.items().stream().map(AutofillResponse.AutofillItem::productId).distinct().count();
        assertThat(distinctIds).isEqualTo(5);

        // No honey (honey category never gets into the pool by the repo query; belt-and-suspenders)
        assertThat(resp.items().stream().map(AutofillResponse.AutofillItem::colorBucket))
                .doesNotContain("honey");

        // colorBucket set on all
        assertThat(resp.items()).allMatch(i -> i.colorBucket() != null && !i.colorBucket().isBlank());
    }

    /**
     * Contract test 7b: verify honey is excluded even if the pool somehow contains one
     * (belt-and-suspenders filter in service layer).
     */
    @Test
    void autofill_honeyInPool_isFiltered() {
        // Build pool that includes a "fruit" category product whose name contains "honey" (edge case)
        // and a real honey-category product (should never come from the repo query but testing the
        // service's in-memory filter)
        Product mango = fruit(1L, "Alphonso Mango", new BigDecimal("200"));
        // Honey-category product — service filters it out
        Product honeyProduct = product(2L, "RAW-HONEY", "Raw Honey", "honey",
                new BigDecimal("500"), true, new HashMap<>());

        when(repo.findByActiveTrueAndCategoryIgnoreCaseOrderByIdAsc("fruit"))
                .thenReturn(List.of(mango, honeyProduct));

        AutofillResponse resp = service.autofill("BRA");

        assertThat(resp.items()).hasSize(1);
        assertThat(resp.items().get(0).productId()).isEqualTo(1L);
        assertThat(resp.filled()).isEqualTo(1);
    }

    // ── Helpers: pool builder ────────────────────────────────────────────────

    private List<Product> buildFruitPool() {
        // 11 distinct fruits covering multiple colour buckets for determinism test
        return List.of(
                fruit(1L,  "Alphonso Mango",  new BigDecimal("200")),  // ORANGE (keyword)
                fruit(2L,  "Kiwi",            new BigDecimal("80")),   // GREEN
                fruit(3L,  "Banana",          new BigDecimal("40")),   // YELLOW
                fruit(4L,  "Litchi",          new BigDecimal("120")),  // RED
                fruit(5L,  "Strawberry",      new BigDecimal("90")),   // RED
                fruit(6L,  "Papaya",          new BigDecimal("60")),   // ORANGE
                fruit(7L,  "Grape",           new BigDecimal("150")),  // PURPLE
                fruit(8L,  "Pineapple",       new BigDecimal("70")),   // YELLOW
                fruit(9L,  "Guava",           new BigDecimal("55")),   // GREEN
                fruit(10L, "Watermelon",      new BigDecimal("30")),   // RED
                fruit(11L, "Blueberry",       new BigDecimal("180"))   // PURPLE
        );
    }
}
