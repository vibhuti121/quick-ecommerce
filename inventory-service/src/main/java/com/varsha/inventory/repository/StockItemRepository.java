package com.varsha.inventory.repository;

import com.varsha.inventory.model.StockItem;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StockItemRepository extends JpaRepository<StockItem, Long> {

    Optional<StockItem> findBySku(String sku);

    /**
     * Row-locks the stock row for the duration of the transaction so concurrent reservations
     * of the same SKU serialize and cannot oversell. Callers lock SKUs in a stable order to
     * avoid deadlocks.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from StockItem s where s.sku = :sku")
    Optional<StockItem> findBySkuForUpdate(@Param("sku") String sku);

    /**
     * Batch non-locking read of multiple SKUs — used by the ATP pre-pass to classify policies
     * before running the Lua script, and by commit/release to read policies in bulk without a
     * per-line round-trip. No lock; callers that need locking use {@link #findBySkuForUpdate}.
     */
    @Query("select s from StockItem s where s.sku in :skus")
    List<StockItem> findAllBySkuIn(@Param("skus") Collection<String> skus);
}
