package com.varsha.catalog.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.varsha.catalog.dto.ProductResponse;
import com.varsha.catalog.exception.SearchUnavailableException;
import com.varsha.catalog.model.ProductType;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.mapping.DynamicMapping;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.TextQueryType;
import org.opensearch.client.opensearch.core.BulkResponse;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.bulk.BulkOperation;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * The product search index (OpenSearch). Postgres stays the source of truth; this is a SECONDARY
 * index kept consistent by two mechanisms owned by {@code CatalogService} and the backfill runner:
 * dual-write on every catalog write, and a startup bulk backfill of the Flyway-seeded rows.
 *
 * <p><b>Graceful degradation is the contract here</b> (mirrors {@code LoggingCacheErrorHandler} for
 * Redis): the write-path methods ({@link #indexProduct}, {@link #deleteProduct}, {@link #bulkIndex},
 * {@link #ensureIndex}) NEVER throw — an OpenSearch outage logs a warning and is swallowed so it can
 * never fail a catalog write or crash boot. Only {@link #search} throws {@link
 * SearchUnavailableException}, and that exists precisely so the caller can fall back to Postgres.
 *
 * <p>If {@code app.search.enabled=false} the {@link OpenSearchClient} bean is absent; this service
 * still loads (injected via {@link ObjectProvider}) but reports {@link #isEnabled()} false and
 * every search degrades to the fallback.
 */
@Service
public class ProductSearchService {

    private static final Logger log = LoggerFactory.getLogger(ProductSearchService.class);

    private final OpenSearchClient client;   // null when app.search.enabled=false
    private final String index;
    private final ObjectMapper mapper;

    public ProductSearchService(ObjectProvider<OpenSearchClient> clientProvider,
                                @Value("${app.search.index:products}") String index) {
        this.client = clientProvider.getIfAvailable();
        this.index = index;
        this.mapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    /** True when an OpenSearch client is wired (i.e. search is enabled). */
    public boolean isEnabled() {
        return client != null;
    }

    /** Best-effort liveness probe used by the backfill runner's readiness wait. Never throws. */
    public boolean ping() {
        if (client == null) {
            return false;
        }
        try {
            return client.ping().value();
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Create the index with an explicit, {@code dynamic:false} mapping if it does not exist. Safe to
     * call repeatedly (the backfill runner calls it on every boot). Never throws — a failure here
     * just means indexing will degrade until OpenSearch is reachable.
     */
    public void ensureIndex() {
        if (client == null) {
            return;
        }
        try {
            boolean exists = client.indices().exists(e -> e.index(index)).value();
            if (exists) {
                return;
            }
            client.indices().create(c -> c
                    .index(index)
                    .mappings(m -> m
                            .dynamic(DynamicMapping.False)
                            .properties("id", p -> p.keyword(k -> k))
                            .properties("sku", p -> p.text(t -> t.fields("keyword", f -> f.keyword(k -> k))))
                            .properties("name", p -> p.text(t -> t))
                            .properties("description", p -> p.text(t -> t))
                            .properties("category", p -> p.text(t -> t.fields("keyword", f -> f.keyword(k -> k))))
                            .properties("productType", p -> p.keyword(k -> k))
                            .properties("active", p -> p.boolean_(b -> b))
                            .properties("attributesText", p -> p.text(t -> t))
                            // Stored, not indexed: it's the reconstruction blob, never a query target.
                            .properties("source", p -> p.keyword(k -> k.index(false).docValues(false)))));
            log.info("search: created OpenSearch index '{}'", index);
        } catch (Exception e) {
            log.warn("search: could not ensure index '{}' (search will degrade until OpenSearch is reachable): {}",
                    index, e.toString());
        }
    }

    /** Index (create-or-replace) a single product. Log-and-degrade; never throws. */
    public void indexProduct(ProductResponse product) {
        if (client == null || product == null) {
            return;
        }
        try {
            ProductDocument doc = ProductDocument.from(product, mapper);
            client.index(i -> i.index(index).id(doc.getId()).document(doc));
        } catch (Exception e) {
            log.warn("search: failed to index product id={} (index now stale for this product): {}",
                    product.id(), e.toString());
        }
    }

    /** Remove a product from the index. Log-and-degrade; a 404 (already gone) is fine. */
    public void deleteProduct(Long id) {
        if (client == null || id == null) {
            return;
        }
        try {
            client.delete(d -> d.index(index).id(String.valueOf(id)));
        } catch (Exception e) {
            log.warn("search: failed to delete product id={} from index: {}", id, e.toString());
        }
    }

    /**
     * Bulk-index a batch (used by the startup backfill). Returns the number submitted; logs item
     * errors but never throws, so a partial OpenSearch failure can't abort the backfill.
     */
    public int bulkIndex(List<ProductResponse> products) {
        if (client == null || products == null || products.isEmpty()) {
            return 0;
        }
        try {
            List<BulkOperation> ops = new ArrayList<>(products.size());
            for (ProductResponse p : products) {
                ProductDocument doc = ProductDocument.from(p, mapper);
                ops.add(BulkOperation.of(b -> b.index(io -> io.index(index).id(doc.getId()).document(doc))));
            }
            BulkResponse resp = client.bulk(b -> b.operations(ops));
            if (resp.errors()) {
                long failed = resp.items().stream().filter(it -> it.error() != null).count();
                log.warn("search: bulk backfill had {} item error(s) of {} submitted", failed, products.size());
            }
            return products.size();
        } catch (Exception e) {
            log.warn("search: bulk backfill failed (search may be empty until next write): {}", e.toString());
            return 0;
        }
    }

    /**
     * Full-text search. Fuzzy {@code multi_match} over boosted fields, filtered to active products
     * (and optional category/type). Returns a {@link Page} of the reconstructed {@link
     * ProductResponse}s (rebuilt from the stored {@code source} — no DB read).
     *
     * @throws SearchUnavailableException if OpenSearch is disabled/unreachable — the caller falls
     *         back to a Postgres query.
     */
    public Page<ProductResponse> search(String q, String category, ProductType type, Pageable pageable) {
        if (client == null) {
            throw new SearchUnavailableException("search is disabled (no OpenSearch client)", null);
        }
        String text = q == null ? "" : q.trim();
        try {
            SearchResponse<ProductDocument> resp = client.search(s -> s
                    .index(index)
                    .from((int) pageable.getOffset())
                    .size(pageable.getPageSize())
                    .query(buildQuery(text, category, type)), ProductDocument.class);

            List<ProductResponse> content = resp.hits().hits().stream()
                    .map(Hit::source)
                    .filter(Objects::nonNull)
                    .map(d -> d.toProductResponse(mapper))
                    .toList();
            long total = resp.hits().total() == null ? content.size() : resp.hits().total().value();
            return new PageImpl<>(content, pageable, total);
        } catch (Exception e) {
            throw new SearchUnavailableException("OpenSearch query failed for q='" + text + "'", e);
        }
    }

    /**
     * Content-based recommendations: products textually similar to the anchor, via OpenSearch
     * {@code more_like_this} over the analyzed fields. The anchor is referenced by its document
     * {@code _id} (no need to re-send its text), filtered to active products and with the anchor
     * itself excluded. Returns reconstructed {@link ProductResponse}s from the stored {@code source}.
     *
     * <p><b>Small-catalog note:</b> {@code more_like_this} defaults to {@code min_term_freq=2} /
     * {@code min_doc_freq=5}, which return <em>nothing</em> on a pilot-sized catalog. We force both
     * to 1 so similarity works from the very first products.
     *
     * @throws SearchUnavailableException if OpenSearch is disabled/unreachable — the recommendation
     *         blend degrades to co-purchase / category fallback.
     */
    public Page<ProductResponse> moreLikeThis(Long id, Pageable pageable) {
        if (client == null) {
            throw new SearchUnavailableException("search is disabled (no OpenSearch client)", null);
        }
        if (id == null) {
            return new PageImpl<>(List.of(), pageable, 0);
        }
        String anchorId = String.valueOf(id);
        try {
            SearchResponse<ProductDocument> resp = client.search(s -> s
                    .index(index)
                    .from((int) pageable.getOffset())
                    .size(pageable.getPageSize())
                    .query(buildMoreLikeThisQuery(anchorId)), ProductDocument.class);

            List<ProductResponse> content = resp.hits().hits().stream()
                    .map(Hit::source)
                    .filter(Objects::nonNull)
                    .map(d -> d.toProductResponse(mapper))
                    .toList();
            long total = resp.hits().total() == null ? content.size() : resp.hits().total().value();
            return new PageImpl<>(content, pageable, total);
        } catch (Exception e) {
            throw new SearchUnavailableException("OpenSearch more_like_this failed for id=" + anchorId, e);
        }
    }

    /**
     * {@code bool}: {@code more_like_this} (the anchor doc as the {@code like} seed) as the scoring
     * clause, with active=true as a filter and the anchor id excluded via {@code must_not}.
     */
    private Query buildMoreLikeThisQuery(String anchorId) {
        return Query.of(q -> q.bool(b -> b
                .must(m -> m.moreLikeThis(mlt -> mlt
                        .fields("name", "description", "category", "attributesText")
                        .like(l -> l.document(d -> d.index(index).id(anchorId)))
                        .minTermFreq(1)
                        .minDocFreq(1)
                        .maxQueryTerms(25)))
                .filter(f -> f.term(t -> t.field("active").value(FieldValue.of(true))))
                .mustNot(mn -> mn.term(t -> t.field("id").value(FieldValue.of(anchorId))))));
    }

    /**
     * {@code bool}: the scoring clause is itself a nested bool that matches on <em>fuzzy OR prefix</em>
     * (minimum_should_match=1), so search behaves as type-ahead. Clause 1 is the original fuzzy
     * multi_match (name^3, sku^2, category^1.5, description, attributesText) — preserves whole-word +
     * typo tolerance. Clause 2 is a phrase_prefix multi_match over the identity fields only
     * (name^3, sku^2, category^1.5) so a leading substring of a token matches ({@code lit}->litchi,
     * {@code hon}->honey); description/attributesText are excluded from the prefix clause to keep
     * type-ahead from latching onto noisy mid-sentence words. active=true and any category/type stay
     * as non-scoring filters on the outer bool.
     */
    private Query buildQuery(String text, String category, ProductType type) {
        return Query.of(q -> q.bool(b -> {
            b.must(m -> m.bool(t -> t
                    .should(sh -> sh.multiMatch(mm -> mm
                            .query(text)
                            .fields("name^3", "sku^2", "category^1.5", "description", "attributesText")
                            .fuzziness("AUTO")
                            .type(TextQueryType.BestFields)))
                    .should(sh -> sh.multiMatch(mm -> mm
                            .query(text)
                            .fields("name^3", "sku^2", "category^1.5")
                            .type(TextQueryType.PhrasePrefix)))
                    .minimumShouldMatch("1")));
            b.filter(f -> f.term(t -> t.field("active").value(FieldValue.of(true))));
            if (category != null && !category.isBlank()) {
                b.filter(f -> f.term(t -> t.field("category.keyword").value(FieldValue.of(category))));
            }
            if (type != null) {
                b.filter(f -> f.term(t -> t.field("productType").value(FieldValue.of(type.name()))));
            }
            return b;
        }));
    }
}
