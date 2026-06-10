package com.varsha.catalog.controller;

import com.varsha.catalog.dto.ProductRequest;
import com.varsha.catalog.dto.ProductResponse;
import com.varsha.catalog.model.ProductType;
import com.varsha.catalog.service.CatalogService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;

/**
 * Catalog API.
 * <ul>
 *   <li>{@code GET /api/catalog/**} — public browse/read (added to gateway PUBLIC_PATHS).</li>
 *   <li>{@code POST/PUT/DELETE /api/catalog/admin/**} — admin writes. The gateway enforces the
 *       ADMIN role (Phase 3, Pillar 1); {@code AdminRoleFilter} re-checks {@code X-User-Role} here
 *       as defense-in-depth.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/catalog")
public class CatalogController {

    private final CatalogService catalog;

    public CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    // ---- public browse ----

    @GetMapping("/products")
    public Page<ProductResponse> browse(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) ProductType type,
            @PageableDefault(size = 20) Pageable pageable) {
        return catalog.browse(category, type, pageable);
    }

    /**
     * Full-text product search (public, like browse). {@code q} is the search term; {@code category}
     * /{@code type} optionally narrow it. Same {@code Page<ProductResponse>} shape as browse, so the
     * storefront renders results with its existing grid. A blank {@code q} returns a normal browse page.
     */
    @GetMapping("/products/search")
    public Page<ProductResponse> search(
            @RequestParam(required = false, defaultValue = "") String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) ProductType type,
            @PageableDefault(size = 20) Pageable pageable) {
        return catalog.search(q, category, type, pageable);
    }

    @GetMapping("/products/{id}")
    public ProductResponse get(@PathVariable Long id) {
        return catalog.get(id);
    }

    /**
     * Hybrid product recommendations ("you may also like") — public, like browse/search. Blends
     * co-purchase (from order-service) with content-based similarity (OpenSearch), falling back to
     * same-category products; best-effort, so it returns a (possibly empty) list rather than 503-ing
     * when a signal is unavailable. Returns a bare {@code List} (not a page) — the related-row is a
     * small fixed strip, not a paginated grid. 404 only if the anchor product itself is missing.
     */
    @GetMapping("/products/{id}/recommendations")
    public java.util.List<ProductResponse> recommendations(
            @PathVariable Long id,
            @RequestParam(required = false, defaultValue = "8") int size) {
        return catalog.recommend(id, size);
    }

    // ---- admin CRUD ----

    @PostMapping("/admin/products")
    public ResponseEntity<ProductResponse> create(@Valid @RequestBody ProductRequest req) {
        ProductResponse body = catalog.create(req);
        return ResponseEntity.created(URI.create("/api/catalog/products/" + body.id())).body(body);
    }

    @PutMapping("/admin/products/{id}")
    public ProductResponse update(@PathVariable Long id, @Valid @RequestBody ProductRequest req) {
        return catalog.update(id, req);
    }

    @DeleteMapping("/admin/products/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        catalog.delete(id);
    }

    /** Upload a product image (multipart) → stored in object storage, product's imageUrl updated. */
    @PostMapping(value = "/admin/products/{id}/image",
            consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ProductResponse uploadImage(@PathVariable Long id,
                                       @RequestParam("file") MultipartFile file) {
        return catalog.uploadImage(id, file);
    }
}
