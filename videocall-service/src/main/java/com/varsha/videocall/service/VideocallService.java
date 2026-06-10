package com.varsha.videocall.service;

import com.varsha.videocall.dto.Dtos.EligibilityResponse;
import com.varsha.videocall.dto.Dtos.EligibilitySummary;
import com.varsha.videocall.dto.Dtos.GrantResponse;
import com.varsha.videocall.dto.Dtos.IceServer;
import com.varsha.videocall.model.Eligibility;
import com.varsha.videocall.repository.CooldownRepository;
import com.varsha.videocall.repository.EligibilityRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class VideocallService {

    private static final Logger log = LoggerFactory.getLogger(VideocallService.class);

    private final EligibilityRepository eligibilityRepo;
    private final CooldownRepository cooldown;
    private final GrantService grants;
    private final List<IceServer> iceServers;

    public VideocallService(EligibilityRepository eligibilityRepo,
                            CooldownRepository cooldown,
                            GrantService grants,
                            List<IceServer> iceServers) {
        this.eligibilityRepo = eligibilityRepo;
        this.cooldown = cooldown;
        this.grants = grants;
        this.iceServers = iceServers;
    }

    /** Idempotent: records that the user completed the interest form. Returns created=true only the first time. */
    @Transactional
    public EligibilityResponse recordEligibility(String userId, String email) {
        if (eligibilityRepo.existsByUserId(userId)) {
            return new EligibilityResponse(true, false);
        }
        try {
            eligibilityRepo.save(new Eligibility(userId, email));
            log.info("eligibility recorded userId={}", userId);
            return new EligibilityResponse(true, true);
        } catch (DataIntegrityViolationException race) {
            // Concurrent first-time post hit the UNIQUE(user_id) constraint — treat as already-eligible.
            return new EligibilityResponse(true, false);
        }
    }

    /**
     * The gate. Returns a grant ONLY if the user is eligible AND not in cooldown; otherwise a NEUTRAL
     * {available:false} (no reason — the silent block). Cooldown is claimed atomically at issuance so a
     * tab-close can't evade it and concurrent requests can't double-issue.
     *
     * Caller (controller) has already rejected guests/missing identity, so userId here is a real user.
     */
    public GrantResponse requestGrant(String userId, String email, String displayName, String requestedRoomId) {
        if (!eligibilityRepo.existsByUserId(userId)) {
            return GrantResponse.unavailable();
        }
        // Atomic SET-if-absent with the 5h TTL. False => already in cooldown => neutral unavailable.
        if (!cooldown.tryStartCooldown(userId)) {
            return GrantResponse.unavailable();
        }
        String roomId = (requestedRoomId != null && !requestedRoomId.isBlank())
                ? requestedRoomId.trim()
                : "room-" + UUID.randomUUID();
        String grant = grants.mint(userId, email, displayName, roomId);
        log.info("grant issued userId={} roomId={} ttl={}s", userId, roomId, grants.getTtlSeconds());
        return GrantResponse.available(grant, roomId, grants.getTtlSeconds(), iceServers);
    }

    /** Founder admin list — most-recent first. */
    @Transactional(readOnly = true)
    public List<EligibilitySummary> listEligibility() {
        return eligibilityRepo.findAll().stream()
                .sorted(Comparator.comparing(Eligibility::getCreatedAt).reversed())
                .map(e -> new EligibilitySummary(e.getUserId(), e.getEmail(), e.getCreatedAt()))
                .toList();
    }
}
