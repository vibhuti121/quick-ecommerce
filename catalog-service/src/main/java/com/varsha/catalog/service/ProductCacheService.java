package com.varsha.catalog.service;

import com.varsha.catalog.dto.CachedPage;
import com.varsha.catalog.dto.ProductResponse;
import com.varsha.catalog.model.ProductType;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

/**
 * Redis-backed read cache in front of {@link ProductReader}. On a cache HIT the database is never
 * touched (the scale lever for the read-heavy catalog); on a MISS the result is loaded and cached.
 * Writes call {@link #evictProduct} / {@link #evictBrowse} so stale entries never outlive a change.
 *
 * <p>Cache misses that throw (e.g. a missing product → {@code NotFoundException}) are NOT cached —
 * {@code @Cacheable} only stores successful return values.
 */
@Service
public class ProductCacheService {

    private final ProductReader reader;

    public ProductCacheService(ProductReader reader) {
        this.reader = reader;
    }

    @Cacheable(value = "catalog:product", key = "#id")
    public ProductResponse product(Long id) {
        return reader.findProduct(id);
    }

    // Sort is intentionally not part of the key — browse has no sort param; page+filters fully identify it.
    // Elvis (?:) handles null category/type; do NOT use String.valueOf here — SpEL resolves the null
    // arg to the char[] overload and NPEs (new String((char[]) null)).
    @Cacheable(value = "catalog:browse",
            key = "(#category ?: '') + '|' + (#type ?: '') + '|' + #page + '|' + #size")
    public CachedPage<ProductResponse> browse(String category, ProductType type, int page, int size) {
        Pageable pageable = PageRequest.of(page, Math.max(size, 1));
        return reader.findBrowse(category, type, pageable);
    }

    @CacheEvict(value = "catalog:product", key = "#id")
    public void evictProduct(Long id) {
        // annotation-only: evicts the single-product entry
    }

    @CacheEvict(value = "catalog:browse", allEntries = true)
    public void evictBrowse() {
        // annotation-only: any write can shift which products/pages are returned, so drop all browse pages
    }
}
