package com.varsha.catalog.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * Admin bulk enable/disable request: flip {@code active} for every product id in {@code ids}.
 * A single-row toggle is just a one-element list. Products are disabled, never deleted.
 */
public record BulkActiveRequest(
        @NotEmpty List<Long> ids,
        @NotNull Boolean active
) {
}
