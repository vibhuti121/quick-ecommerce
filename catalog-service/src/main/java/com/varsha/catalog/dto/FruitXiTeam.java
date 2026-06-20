package com.varsha.catalog.dto;

/**
 * Immutable DTO for a single WC-2026 team entry.
 * Serialized directly by the /teams endpoint.
 */
public record FruitXiTeam(
        String code,
        String name,
        String flag,
        String colorPrimary,
        String colorSecondary
) {}
