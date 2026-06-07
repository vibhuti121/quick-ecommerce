package com.varsha.catalog.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@Entity
@Table(name = "variants")
public class Variant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String sku;

    @Column(nullable = false)
    private String name;

    @Column(name = "price_delta", nullable = false, precision = 12, scale = 2)
    private BigDecimal priceDelta = BigDecimal.ZERO;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> attributes = new HashMap<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public BigDecimal getPriceDelta() { return priceDelta; }
    public void setPriceDelta(BigDecimal priceDelta) { this.priceDelta = priceDelta; }

    public Map<String, Object> getAttributes() { return attributes; }
    public void setAttributes(Map<String, Object> attributes) { this.attributes = attributes; }
}
