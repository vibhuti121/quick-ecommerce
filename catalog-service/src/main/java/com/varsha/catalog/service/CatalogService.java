package com.varsha.catalog.service;

import com.varsha.catalog.dto.ProductRequest;
import com.varsha.catalog.dto.ProductResponse;
import com.varsha.catalog.dto.VariantRequest;
import com.varsha.catalog.exception.ConflictException;
import com.varsha.catalog.exception.NotFoundException;
import com.varsha.catalog.model.Product;
import com.varsha.catalog.model.ProductType;
import com.varsha.catalog.model.Variant;
import com.varsha.catalog.repository.ProductRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;

/**
 * Entity → DTO conversion happens INSIDE the transactional methods on purpose: with
 * {@code open-in-view: false} the Hibernate session is closed by the time the controller
 * serializes, so the lazy {@code variants} collection must be materialised here.
 */
@Service
public class CatalogService {

    private final ProductRepository products;

    public CatalogService(ProductRepository products) {
        this.products = products;
    }

    // ---- public browse (read path) ----

    @Transactional(readOnly = true)
    public Page<ProductResponse> browse(String category, ProductType type, Pageable pageable) {
        Page<Product> page;
        if (category != null && !category.isBlank()) {
            page = products.findByActiveTrueAndCategoryIgnoreCase(category, pageable);
        } else if (type != null) {
            page = products.findByActiveTrueAndProductType(type, pageable);
        } else {
            page = products.findByActiveTrue(pageable);
        }
        return page.map(ProductResponse::from);
    }

    @Transactional(readOnly = true)
    public ProductResponse get(Long id) {
        return ProductResponse.from(load(id));
    }

    // ---- admin CRUD (write path) ----

    @Transactional
    public ProductResponse create(ProductRequest req) {
        if (products.existsBySku(req.sku())) {
            throw new ConflictException("SKU already exists: " + req.sku());
        }
        Product p = new Product();
        apply(p, req);
        return ProductResponse.from(products.save(p));
    }

    @Transactional
    public ProductResponse update(Long id, ProductRequest req) {
        Product p = load(id);
        if (!p.getSku().equals(req.sku()) && products.existsBySku(req.sku())) {
            throw new ConflictException("SKU already exists: " + req.sku());
        }
        p.getVariants().clear();
        apply(p, req);
        return ProductResponse.from(products.save(p));
    }

    @Transactional
    public void delete(Long id) {
        if (!products.existsById(id)) {
            throw new NotFoundException("Product not found: " + id);
        }
        products.deleteById(id);
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
