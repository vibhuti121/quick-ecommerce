package com.varsha.catalog.service;

import com.varsha.catalog.dto.CachedPage;
import com.varsha.catalog.dto.ProductResponse;
import com.varsha.catalog.exception.NotFoundException;
import com.varsha.catalog.model.Product;
import com.varsha.catalog.model.ProductType;
import com.varsha.catalog.repository.ProductRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
