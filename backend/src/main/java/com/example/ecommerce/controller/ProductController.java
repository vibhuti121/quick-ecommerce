package com.example.ecommerce.controller;

import com.example.ecommerce.model.Product;
import com.example.ecommerce.store.ProductStore;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductStore productStore;

    public ProductController(ProductStore productStore) {
        this.productStore = productStore;
    }

    @GetMapping
    public List<Product> getAll() {
        return productStore.findAll();
    }

    @GetMapping("/{id}")
    public Product getById(@PathVariable long id) {
        return productStore.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Product " + id + " not found"));
    }
}
