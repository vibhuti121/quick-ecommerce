package com.varsha.catalog.service;

import com.varsha.catalog.dto.NotifyRequest;
import com.varsha.catalog.dto.NotifyResponse;
import com.varsha.catalog.model.NotifySignup;
import com.varsha.catalog.repository.NotifySignupRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Persists launch-interest signups. Idempotent on (topic, phone) — a re-submit returns the existing row
 * rather than creating a duplicate, mirroring the storefront's localStorage dedupe (and backed by the
 * unique index in V4 so a race can't slip a second row through).
 */
@Service
@Transactional
public class NotifyService {

    private final NotifySignupRepository repo;

    public NotifyService(NotifySignupRepository repo) {
        this.repo = repo;
    }

    public NotifyResponse save(NotifyRequest req) {
        String topic = req.topic().trim();
        String phone = req.phone().trim();
        String email = normalizeEmail(req.email());
        String pincode = trimToNull(req.pincode());
        String city = trimToNull(req.city());
        String state = trimToNull(req.state());

        return repo.findByTopicAndPhone(topic, phone)
                .map(NotifyResponse::from)
                .orElseGet(() -> {
                    NotifySignup s = new NotifySignup();
                    s.setTopic(topic);
                    s.setPhone(phone);
                    s.setEmail(email);
                    s.setPincode(pincode);
                    s.setCity(city);
                    s.setState(state);
                    return NotifyResponse.from(repo.save(s));
                });
    }

    @Transactional(readOnly = true)
    public List<NotifyResponse> list() {
        return repo.findAllByOrderByCreatedAtDesc().stream()
                .map(NotifyResponse::from)
                .toList();
    }

    /** Public, read-only signup count for a topic — surfaces drop-list demand without exposing any PII. */
    @Transactional(readOnly = true)
    public long countByTopic(String topic) {
        return repo.countByTopic(topic.trim());
    }

    private static String normalizeEmail(String email) {
        if (email == null) return null;
        String trimmed = email.trim().toLowerCase();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
