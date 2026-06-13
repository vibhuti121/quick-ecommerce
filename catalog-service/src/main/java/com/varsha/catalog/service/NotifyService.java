package com.varsha.catalog.service;

import com.varsha.catalog.dto.DemandResponse;
import com.varsha.catalog.dto.NotifyRequest;
import com.varsha.catalog.dto.NotifyResponse;
import com.varsha.catalog.model.NotifySignup;
import com.varsha.catalog.repository.NotifySignupRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Persists launch-interest signups. Idempotent on (topic, phone) — a re-submit returns the existing row
 * rather than creating a duplicate, mirroring the storefront's localStorage dedupe (and backed by the
 * unique index in V4 so a race can't slip a second row through).
 *
 * <p>The fruit quiz reuses this: a single submit carries an umbrella {@code topic} ('quiz') plus a list of
 * chosen fruit slugs, and the service fans those out to one (topic=fruit, phone) row each. Per-fruit
 * demand is then a {@code GROUP BY topic} the Demand dashboard reads — no separate interest table needed
 * for the flat pilot (that's the Phase 0.5 people/addresses/interests normalisation).
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
        String name = trimToNull(req.name());
        String source = trimToNull(req.source());
        String phone = req.phone().trim();
        String email = normalizeEmail(req.email());
        String pincode = trimToNull(req.pincode());
        String city = trimToNull(req.city());
        String state = trimToNull(req.state());

        // The umbrella row (honey teaser topic, or 'quiz' for a quiz completion) is what we echo back.
        NotifyResponse umbrella = upsert(topic, name, source, phone, email, pincode, city, state);

        // Quiz fan-out: one row per chosen fruit (deduped on its own topic+phone), so per-fruit demand is
        // a free aggregate. Skip any slug equal to the umbrella topic to avoid a redundant duplicate row.
        for (String fruit : normalizeFruits(req.fruits())) {
            if (!fruit.equals(topic)) {
                upsert(fruit, name, source, phone, email, pincode, city, state);
            }
        }
        return umbrella;
    }

    /** Create-or-return the (topic, phone) row, refreshing the lead's name/source/location if newly given. */
    private NotifyResponse upsert(String topic, String name, String source, String phone, String email,
                                  String pincode, String city, String state) {
        return repo.findByTopicAndPhone(topic, phone)
                .map(NotifyResponse::from)
                .orElseGet(() -> {
                    NotifySignup s = new NotifySignup();
                    s.setTopic(topic);
                    s.setName(name);
                    s.setSource(source);
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

    /** Aggregated demand for the admin dashboard: headcount, per-fruit, per-state, and the latest leads. */
    @Transactional(readOnly = true)
    public DemandResponse demand() {
        List<DemandResponse.TopicDemand> byFruit = repo.demandByTopic().stream()
                .map(r -> new DemandResponse.TopicDemand(r.getTopic(), r.getSignups(), r.getPeople()))
                .toList();
        List<DemandResponse.StateDemand> byState = repo.demandByState().stream()
                .map(r -> new DemandResponse.StateDemand(r.getState(), r.getSignups()))
                .toList();
        List<NotifyResponse> recent = repo.findTop50ByOrderByCreatedAtDesc().stream()
                .map(NotifyResponse::from)
                .toList();
        return new DemandResponse(repo.count(), repo.countDistinctPeople(), byFruit, byState, recent);
    }

    /** Lowercase, de-dupe and drop blanks from the chosen-fruit slugs while preserving selection order. */
    private static List<String> normalizeFruits(List<String> fruits) {
        if (fruits == null || fruits.isEmpty()) return List.of();
        Set<String> seen = new LinkedHashSet<>();
        List<String> out = new ArrayList<>();
        for (String f : fruits) {
            if (f == null) continue;
            String slug = f.trim().toLowerCase();
            if (!slug.isEmpty() && seen.add(slug)) out.add(slug);
        }
        return out;
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
