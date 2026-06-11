package com.varsha.catalog.service;

import com.varsha.catalog.dto.ProductRequest;
import com.varsha.catalog.dto.ProductResponse;
import com.varsha.catalog.dto.VariantRequest;
import com.varsha.catalog.exception.ConflictException;
import com.varsha.catalog.exception.NotFoundException;
import com.varsha.catalog.exception.SearchUnavailableException;
import com.varsha.catalog.model.Product;
import com.varsha.catalog.model.ProductType;
import com.varsha.catalog.model.Variant;
import com.varsha.catalog.repository.ProductRepository;
import com.varsha.catalog.search.ProductSearchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static net.logstash.logback.argument.StructuredArguments.kv;

/**
 * Entity → DTO conversion happens INSIDE the transactional methods on purpose: with
 * {@code open-in-view: false} the Hibernate session is closed by the time the controller
 * serializes, so the lazy {@code variants} collection must be materialised here.
 */
@Service
public class CatalogService {

    private static final Logger log = LoggerFactory.getLogger(CatalogService.class);

    // image/<subtype> -> file extension, for objects whose key should be human-readable in MinIO.
    private static final Map<String, String> IMAGE_EXTENSIONS = Map.of(
            "image/jpeg", ".jpg",
            "image/png", ".png",
            "image/webp", ".webp",
            "image/gif", ".gif",
            "image/svg+xml", ".svg");

    private final ProductRepository products;
    private final ProductCacheService cache;
    private final ObjectStorageService storage;
    private final ProductSearchService search;
    private final ProductReader reader;
    private final RecommendationService recommendations;

    public CatalogService(ProductRepository products, ProductCacheService cache,
                          ObjectStorageService storage, ProductSearchService search,
                          ProductReader reader, RecommendationService recommendations) {
        this.products = products;
        this.cache = cache;
        this.storage = storage;
        this.search = search;
        this.reader = reader;
        this.recommendations = recommendations;
    }

    // ---- public browse (read path) ----
    // Non-transactional delegators: a cache HIT never opens a DB session; on a MISS the cache bean
    // calls the transactional ProductReader. Caching lives in a separate bean so the @Cacheable
    // proxy is not bypassed by self-invocation.

    public Page<ProductResponse> browse(String category, ProductType type, Pageable pageable) {
        return cache.browse(category, type, pageable.getPageNumber(), pageable.getPageSize())
                .toPage(pageable);
    }

    public ProductResponse get(Long id) {
        return cache.product(id);
    }

    /**
     * Full-text search. A blank query is just a browse (keeps the endpoint useful with no term). With
     * a term we hit OpenSearch (fuzzy, attribute-aware, relevance-ranked); if OpenSearch is down we
     * degrade to a Postgres {@code ILIKE} scan so search never 503s — same graceful-degradation ethos
     * as the Redis cache. Deliberately NOT cached: query strings are high-cardinality and a just-created
     * SKU must be findable immediately.
     */
    public Page<ProductResponse> search(String q, String category, ProductType type, Pageable pageable) {
        if (q == null || q.isBlank()) {
            return browse(category, type, pageable);
        }
        try {
            return search.search(q, category, type, pageable);
        } catch (SearchUnavailableException e) {
            return reader.searchFallback(q.trim(), pageable);
        }
    }

    /**
     * Hybrid "you may also like" recommendations for a product (co-purchase first, content-based
     * fills, same-category fallback). Best-effort by design — never 503s; only a missing anchor
     * surfaces (404). Delegates to {@link RecommendationService}; deliberately uncached (must
     * reflect fresh orders, same stance as {@link #search}).
     */
    public List<ProductResponse> recommend(Long id, int size) {
        return recommendations.recommend(id, size);
    }

    // ---- admin list (read path, uncached) ----

    /**
     * Every product, active or not, for the admin console — sorted active-first then by SKU so the
     * operator sees live products at the top. Deliberately uncached and not behind the public
     * {@code active=true} browse filter: the admin must see disabled products to re-enable them.
     * Runs in a read tx so the lazy {@code variants} materialize before serialization.
     */
    @Transactional(readOnly = true)
    public List<ProductResponse> adminList() {
        return products.findAll(Sort.by(Sort.Order.desc("active"), Sort.Order.asc("sku")))
                .stream().map(ProductResponse::from).toList();
    }

    // ---- admin CRUD (write path) ----
    // Each write evicts the affected entries so cached reads never outlive a change.

    @Transactional
    public ProductResponse create(ProductRequest req) {
        if (products.existsBySku(req.sku())) {
            throw new ConflictException("SKU already exists: " + req.sku());
        }
        Product p = new Product();
        apply(p, req);
        ProductResponse saved = ProductResponse.from(products.save(p));
        cache.evictBrowse();
        search.indexProduct(saved);   // dual-write: keep the search index consistent (log-and-degrade)
        // Admin audit trail — trace.id + hashed user_id ride along from MDC (UserIdMdcFilter); lands in
        // Elasticsearch/Kibana via the LogstashEncoder. No raw PII here: id/sku/name/price are catalog data.
        log.info("admin.product.created {}", saved.sku(),
                kv("event", "admin.product.created"),
                kv("payload", Map.of(
                        "id", saved.id(),
                        "sku", saved.sku(),
                        "name", saved.name(),
                        "basePrice", saved.basePrice().toPlainString(),
                        "active", saved.active())));
        return saved;
    }

    @Transactional
    public ProductResponse update(Long id, ProductRequest req) {
        Product p = load(id);
        if (!p.getSku().equals(req.sku()) && products.existsBySku(req.sku())) {
            throw new ConflictException("SKU already exists: " + req.sku());
        }
        p.getVariants().clear();
        apply(p, req);
        ProductResponse saved = ProductResponse.from(products.save(p));
        cache.evictProduct(id);
        cache.evictBrowse();
        search.indexProduct(saved);   // dual-write: re-index the updated product (log-and-degrade)
        log.info("admin.product.updated {}", saved.sku(),
                kv("event", "admin.product.updated"),
                kv("payload", Map.of(
                        "id", saved.id(),
                        "sku", saved.sku(),
                        "name", saved.name(),
                        "basePrice", saved.basePrice().toPlainString(),
                        "active", saved.active())));
        return saved;
    }

    /**
     * Enable/disable one or more products in a single call (admin bulk + per-row toggle). Disabling
     * sets {@code active=false}, which hides the product from every customer path (browse/search/
     * recommendations all filter {@code active=true}) — this is the "soft delete" that replaced hard
     * delete. Each affected product has its cache evicted and is re-indexed so reads reflect the change.
     */
    @Transactional
    public List<ProductResponse> setActive(List<Long> ids, boolean active) {
        List<ProductResponse> updated = new java.util.ArrayList<>();
        for (Long id : ids) {
            Product p = load(id);
            p.setActive(active);
            ProductResponse saved = ProductResponse.from(products.save(p));
            cache.evictProduct(id);
            search.indexProduct(saved);   // dual-write: visibility changed, re-index (log-and-degrade)
            updated.add(saved);
        }
        cache.evictBrowse();
        log.info("admin.product.active.changed {}", active,
                kv("event", "admin.product.active.changed"),
                kv("payload", Map.of(
                        "active", active,
                        "count", updated.size(),
                        "skus", updated.stream().map(ProductResponse::sku).toList())));
        return updated;
    }

    /**
     * Uploads a product image to object storage and points the product at its public URL. The image
     * itself is the source of truth in MinIO; the DB only holds the URL. Caches are evicted so reads
     * pick up the new image immediately.
     */
    @Transactional
    public ProductResponse uploadImage(Long id, MultipartFile file) {
        Product p = load(id);
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("image file is required");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.toLowerCase().startsWith("image/")) {
            throw new IllegalArgumentException("uploaded file must be an image (got: " + contentType + ")");
        }
        String key = "products/" + id + "/" + UUID.randomUUID() + extensionFor(contentType);
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new IllegalArgumentException("could not read uploaded file: " + e.getMessage());
        }
        String url = storage.upload(key, bytes, contentType);
        p.setImageUrl(url);
        ProductResponse saved = ProductResponse.from(products.save(p));
        cache.evictProduct(id);
        cache.evictBrowse();
        search.indexProduct(saved);   // dual-write: image URL changed, re-index (log-and-degrade)
        return saved;
    }

    private static String extensionFor(String contentType) {
        return IMAGE_EXTENSIONS.getOrDefault(contentType.toLowerCase(), "");
    }

    private Product load(Long id) {
        return products.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found: " + id));
    }

    private void apply(Product p, ProductRequest req) {
        p.setSku(req.sku());
        p.setName(req.name());
        p.setDescription(req.description());
        p.setProductType(req.productType());
        p.setCategory(req.category());
        p.setBasePrice(req.basePrice());
        p.setCurrency(req.currency() == null || req.currency().isBlank() ? "INR" : req.currency());
        p.setImageUrl(req.imageUrl());
        p.setAttributes(req.attributes() == null ? new HashMap<>() : new HashMap<>(req.attributes()));
        p.setActive(req.active() == null ? true : req.active());

        List<VariantRequest> vreqs = req.variants();
        if (vreqs != null) {
            for (VariantRequest vr : vreqs) {
                Variant v = new Variant();
                v.setSku(vr.sku());
                v.setName(vr.name());
                v.setPriceDelta(vr.priceDelta() == null ? BigDecimal.ZERO : vr.priceDelta());
                v.setAttributes(vr.attributes() == null ? new HashMap<>() : new HashMap<>(vr.attributes()));
                p.getVariants().add(v);
            }
        }
    }
}
