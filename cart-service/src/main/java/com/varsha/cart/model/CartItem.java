package com.varsha.cart.model;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

/**
 * A cart line. Price/name/image are <em>snapshotted</em> from the catalog at add-time so the
 * cart renders even if catalog-service is momentarily unavailable, and so a later catalog price
 * change does not silently mutate a cart already in progress.
 */
public class CartItem {

    private Long productId;
    private String sku;
    private String name;
    private String imageUrl;
    private BigDecimal unitPrice;
    private int quantity;

    public CartItem() {
    }

    public CartItem(Long productId, String sku, String name, String imageUrl, BigDecimal unitPrice, int quantity) {
        this.productId = productId;
        this.sku = sku;
        this.name = name;
        this.imageUrl = imageUrl;
        this.unitPrice = unitPrice;
        this.quantity = quantity;
    }

    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    public BigDecimal getLineTotal() {
        if (unitPrice == null) {
            return BigDecimal.ZERO;
        }
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }

    public BigDecimal getUnitPrice() { return unitPrice; }
    public void setUnitPrice(BigDecimal unitPrice) { this.unitPrice = unitPrice; }

    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
}
