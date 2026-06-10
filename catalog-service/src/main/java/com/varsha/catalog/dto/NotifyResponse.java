package com.varsha.catalog.dto;

import com.varsha.catalog.model.NotifySignup;

import java.time.Instant;

public record NotifyResponse(
        Long id,
        String topic,
        String phone,
        String email,
        Instant createdAt
) {
    public static NotifyResponse from(NotifySignup s) {
        return new NotifyResponse(
                s.getId(),
                s.getTopic(),
                s.getPhone(),
                s.getEmail(),
                s.getCreatedAt()
        );
    }
}
