package com.varsha.catalog.search;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.varsha.catalog.dto.ProductResponse;

import java.util.Map;

/**
 * The OpenSearch document shape for a product. Two jobs:
 * <ol>
 *   <li><b>Search</b> — the explicit fields ({@code name}, {@code sku}, {@code category},
 *       {@code description}, {@code attributesText}) are what the query matches against.</li>
 *   <li><b>Reconstruct</b> — {@code source} carries the full {@link ProductResponse} as a JSON
 *       string so a search hit rebuilds the exact browse-shaped response with NO second DB read
 *       (mirrors the cache's no-N+1 ethos).</li>
 * </ol>
 *
 * <p><b>Why {@code attributesText} (a flattened string) instead of the raw {@code attributes}
 * map:</b> products carry arbitrary JSONB attributes (honey {@code floral_source=Coorg}, fruit
 * {@code grade}, nested {@code provenance.origin}). Indexing the map directly invites mapping
 * conflicts (the same key typed as string in one product and number in another rejects the doc).
 * Flattening every scalar value into one analyzed text field makes "Coorg", "wild multi-floral",
 * etc. searchable with zero dynamic mapping. The index mapping is {@code dynamic:false}, so
 * {@code source} is stored-but-not-indexed and nothing unexpected creeps into the mapping.
 *
 * <p>Plain mutable POJO (no-arg ctor + getters/setters) so the Jackson-backed JSONP mapper can
 * deserialize hits into it.
 */
public class ProductDocument {

    private String id;
    private String sku;
    private String name;
    private String description;
    private String category;
    private String productType;
    private boolean active;
    private String attributesText;
    private String source;

    public ProductDocument() {
    }

    /** Build the index document from a response DTO; {@code source} is the DTO serialized to JSON. */
    public static ProductDocument from(ProductResponse p, ObjectMapper mapper) {
        ProductDocument d = new ProductDocument();
        d.id = String.valueOf(p.id());
        d.sku = p.sku();
        d.name = p.name();
        d.description = p.description();
        d.category = p.category();
        d.productType = p.productType() == null ? null : p.productType().name();
        d.active = p.active();
        d.attributesText = flatten(p.attributes());
        try {
            d.source = mapper.writeValueAsString(p);
        } catch (JsonProcessingException e) {
            // Should never happen for a well-formed DTO; fail loud here rather than index a half doc.
            throw new IllegalStateException("could not serialize ProductResponse for indexing: " + p.id(), e);
        }
        return d;
    }

    /** Rebuild the original response DTO from the stored {@code source} blob (no DB read). */
    public ProductResponse toProductResponse(ObjectMapper mapper) {
        try {
            return mapper.readValue(source, ProductResponse.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("could not deserialize search hit source for id=" + id, e);
        }
    }

    /**
     * Flatten arbitrary JSONB attributes into one space-joined string of scalar values, recursing
     * into nested maps/lists (so {@code provenance.origin} contributes "Coorg"). Keys are included
     * too — a shopper searching the attribute name still matches. Null-safe; never throws.
     */
    static String flatten(Map<String, Object> attributes) {
        if (attributes == null || attributes.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        appendMap(sb, attributes);
        return sb.toString().trim();
    }

    private static void appendMap(StringBuilder sb, Map<?, ?> map) {
        for (Map.Entry<?, ?> e : map.entrySet()) {
            if (e.getKey() != null) {
                sb.append(e.getKey()).append(' ');
            }
            appendValue(sb, e.getValue());
        }
    }

    @SuppressWarnings("unchecked")
    private static void appendValue(StringBuilder sb, Object value) {
        if (value == null) {
            return;
        }
        if (value instanceof Map<?, ?> m) {
            appendMap(sb, m);
        } else if (value instanceof Iterable<?> it) {
            for (Object o : it) {
                appendValue(sb, o);
            }
        } else {
            sb.append(value).append(' ');
        }
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getProductType() { return productType; }
    public void setProductType(String productType) { this.productType = productType; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public String getAttributesText() { return attributesText; }
    public void setAttributesText(String attributesText) { this.attributesText = attributesText; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}
