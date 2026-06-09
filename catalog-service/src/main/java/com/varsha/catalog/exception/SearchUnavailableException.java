package com.varsha.catalog.exception;

/**
 * Thrown by the search layer when OpenSearch cannot serve a query (down, slow, index missing).
 * It is NOT an error surfaced to the client — {@code CatalogService} catches it and degrades the
 * search endpoint to a Postgres {@code ILIKE} fallback, so search keeps working (without fuzziness
 * or attribute matching) instead of returning a 503. Write-path indexing never throws this: those
 * calls log-and-degrade in place so an OpenSearch outage can never fail a catalog write.
 */
public class SearchUnavailableException extends RuntimeException {
    public SearchUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
