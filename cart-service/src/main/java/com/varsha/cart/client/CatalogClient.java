package com.varsha.cart.client;

import com.varsha.cart.exception.CartExceptions.CatalogUnavailableException;
import com.varsha.cart.exception.CartExceptions.ProductNotFoundException;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.ResourceAccessException;

/**
 * Synchronous catalog lookup used only when a brand-new line is added (to snapshot price/name).
 * Reads of an existing cart never touch the catalog, which keeps the read path fast and resilient.
 */
@Component
public class CatalogClient {

    private final RestClient restClient;

    public CatalogClient(RestClient catalogRestClient) {
        this.restClient = catalogRestClient;
    }

    public ProductView fetch(Long productId) {
        try {
            return restClient.get()
                    .uri("/api/catalog/products/{id}", productId)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new ProductNotFoundException("Product not found in catalog: " + productId);
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new CatalogUnavailableException("Catalog returned " + res.getStatusCode());
                    })
                    .body(ProductView.class);
        } catch (ResourceAccessException e) {
            // connection refused / timeout — catalog is down or slow
            throw new CatalogUnavailableException("Could not reach catalog-service: " + e.getMessage());
        }
    }
}
