package com.varsha.catalog.model;

/**
 * The kinds of things this platform can sell. The schema (enum + JSONB attributes)
 * is deliberately open-ended so a new product kind needs no migration — add a value
 * here and put the kind-specific fields in {@code attributes}.
 */
public enum ProductType {
    PHYSICAL,
    DIGITAL,
    SERVICE,
    SUBSCRIPTION,
    RENTAL
}
