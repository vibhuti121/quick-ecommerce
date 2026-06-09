package com.varsha.catalog.repository;

import com.varsha.catalog.model.Product;
import com.varsha.catalog.model.ProductType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long> {

    Optional<Product> findBySku(String sku);

    boolean existsBySku(String sku);

    Page<Product> findByActiveTrue(Pageable pageable);

    Page<Product> findByActiveTrueAndCategoryIgnoreCase(String category, Pageable pageable);

    Page<Product> findByActiveTrueAndProductType(ProductType productType, Pageable pageable);

    /**
     * Degraded search path when OpenSearch is unreachable: a case-insensitive substring match over
     * name/description/sku on active products. No fuzziness, no attribute search, no relevance ranking
     * — just enough that the search endpoint never 503s during an OpenSearch outage.
     */
    @Query("""
            select p from Product p
            where p.active = true and (
                lower(p.name)        like lower(concat('%', :q, '%')) or
                lower(p.description) like lower(concat('%', :q, '%')) or
                lower(p.sku)         like lower(concat('%', :q, '%')))
            """)
    Page<Product> searchFallback(@Param("q") String q, Pageable pageable);

    /** Targeted image-URL update — used by the MinIO seeder so it never touches variants/other fields. */
    @Modifying
    @Transactional
    @Query("update Product p set p.imageUrl = :url where p.id = :id")
    int updateImageUrl(@Param("id") Long id, @Param("url") String url);
}
