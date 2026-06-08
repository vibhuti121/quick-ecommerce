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
 *   <li>{@code POST/PUT/DELETE /api/catalog/admin/**} — admin writes (gateway requires auth +
 *       eventually an admin role check).</li>
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

    @GetMapping("/products/{id}")
    public ProductResponse get(@PathVariable Long id) {
        return catalog.get(id);
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
