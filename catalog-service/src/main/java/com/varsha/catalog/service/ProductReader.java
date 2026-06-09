package com.varsha.catalog.service;

import com.varsha.catalog.dto.CachedPage;
import com.varsha.catalog.dto.ProductResponse;
import com.varsha.catalog.exception.NotFoundException;
import com.varsha.catalog.model.Product;
import com.varsha.catalog.model.ProductType;
import com.varsha.catalog.repository.ProductRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The transactional read path (DB → DTO). Kept as a separate bean from {@link ProductCacheService}
 * so the {@code @Cacheable} proxy and the {@code @Transactional} proxy compose cleanly: a cache HIT
 * never opens a database transaction, and a cache MISS materialises the lazy {@code variants}
 * collection here (with {@code open-in-view: false}, conversion must happen inside the session).
 */
@Service
public class ProductReader {

    private final ProductRepository products;

    public ProductReader(ProductRepository products) {
        this.products = products;
    }

    @Transactional(readOnly = true)
    public ProductResponse findProduct(Long id) {
        return ProductResponse.from(products.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found: " + id)));
    }

    /**
     * Every product (active or not), as response DTOs, for the search backfill. Inactive products are
     * indexed too so a later reactivation is searchable immediately; the search query filters on
     * {@code active=true} regardless. Runs in a read tx so the lazy {@code variants} materialize here.
     */
    @Transactional(readOnly = true)
    public Page<ProductResponse> findAllForIndex(Pageable pageable) {
        return products.findAll(pageable).map(ProductResponse::from);
    }

    /** Postgres fallback for the search endpoint when OpenSearch is down. Maps in-tx (lazy variants). */
    @Transactional(readOnly = true)
    public Page<ProductResponse> searchFallback(String q, Pageable pageable) {
        return products.searchFallback(q, pageable).map(ProductResponse::from);
    }

    /**
     * Resolve recommendation ids (e.g. co-purchase) to active product DTOs, preserving the input
     * ranking. Ids that are missing or inactive are silently dropped. Runs in a read tx so lazy
     * {@code variants} materialize here (open-in-view is off).
     */
    @Transactional(readOnly = true)
    public List<ProductResponse> findByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        Map<Long, Product> byId = products.findByIdInAndActiveTrue(ids).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        return ids.stream()
                .map(byId::get)
                .filter(Objects::nonNull)
                .map(ProductResponse::from)
                .toList();
    }

    /**
     * Recommendation cold-start fallback: up to {@code limit} other active products in the same
     * category as the anchor. Maps in-tx (lazy variants).
     */
    @Transactional(readOnly = true)
    public List<ProductResponse> sameCategoryFallback(String category, Long excludeId, int limit) {
        if (category == null || category.isBlank() || limit <= 0) {
            return List.of();
        }
        return products
                .findByActiveTrueAndCategoryIgnoreCaseAndIdNot(category, excludeId, PageRequest.of(0, limit))
                .map(ProductResponse::from)
                .getContent();
    }

    @Transactional(readOnly = true)
    public CachedPage<ProductResponse> findBrowse(String category, ProductType type, Pageable pageable) {
        Page<Product> page;
        if (category != null && !category.isBlank()) {
            page = products.findByActiveTrueAndCategoryIgnoreCase(category, pageable);
        } else if (type != null) {
            page = products.findByActiveTrueAndProductType(type, pageable);
        } else {
            page = products.findByActiveTrue(pageable);
        }
        return CachedPage.of(page.map(ProductResponse::from));
    }
}
