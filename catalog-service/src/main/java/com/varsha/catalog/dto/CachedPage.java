package com.varsha.catalog.dto;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.List;

/**
 * A JSON-safe snapshot of a {@link Page} for Redis caching. Spring's {@code PageImpl} has no
 * default constructor and serializes unreliably through {@code GenericJackson2JsonRedisSerializer},
 * so we cache this flat record instead and rebuild the {@link Page} on read.
 */
public record CachedPage<T>(List<T> content, int number, int size, long totalElements) {

    public static <T> CachedPage<T> of(Page<T> page) {
        return new CachedPage<>(page.getContent(), page.getNumber(), page.getSize(), page.getTotalElements());
    }

    public Page<T> toPage(Pageable pageable) {
        return new PageImpl<>(content, pageable, totalElements);
    }
}
