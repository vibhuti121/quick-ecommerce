package com.varsha.order.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "order_items")
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(nullable = false)
    private String sku;

    @Column(nullable = false)
    private String name;

    @Column(name = "unit_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal unitPrice;

    @Column(nullable = false)
    private int quantity;

    protected OrderItem() {
    }

    public OrderItem(Long productId, String sku, String name, BigDecimal unitPrice, int quantity) {
        this.productId = productId;
        this.sku = sku;
        this.name = name;
        this.unitPrice = unitPrice;
        this.quantity = quantity;
    }

    public Long getId() { return id; }

    public Long getProductId() { return productId; }

    public String getSku() { return sku; }

    public String getName() { return name; }

    public BigDecimal getUnitPrice() { return unitPrice; }

    public int getQuantity() { return quantity; }

    /** Line total = unitPrice * quantity. */
    public BigDecimal getLineTotal() {
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
}
