package com.varsha.catalog.repository;

import com.varsha.catalog.model.Product;
import com.varsha.catalog.model.ProductType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long> {

    Optional<Product> findBySku(String sku);

    boolean existsBySku(String sku);

    Page<Product> findByActiveTrue(Pageable pageable);

    Page<Product> findByActiveTrueAndCategoryIgnoreCase(String category, Pageable pageable);

    Page<Product> findByActiveTrueAndProductType(ProductType productType, Pageable pageable);
}
