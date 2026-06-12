package com.varsha.catalog.dto;

/**
 * Public, read-only signup count for a topic — e.g. how many people are on the honey drop list.
 * Deliberately leaks nothing but an aggregate integer + the topic key (no PII), so it can sit on the
 * public side of the gateway alongside POST /api/catalog/notify.
 */
public record NotifyCountResponse(String topic, long count) {}
