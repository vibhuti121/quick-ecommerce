package com.varsha.videocall.repository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

import java.time.Duration;

/**
 * The silent 5-hour post-session block. Keyed {@code videocall:cd:{userId}} with a TTL set at grant
 * issuance — enforced SERVER-SIDE at the next grant request, so closing the tab can't evade it and the
 * client is never told a reason (see {@link com.varsha.videocall.service.VideocallService}).
 */
@Repository
public class CooldownRepository {

    private static final String PREFIX = "videocall:cd:";

    private final StringRedisTemplate redis;
    private final Duration ttl;

    public CooldownRepository(StringRedisTemplate redis,
                              @Value("${app.videocall.cooldown-hours:5}") long cooldownHours) {
        this.redis = redis;
        this.ttl = Duration.ofHours(cooldownHours);
    }

    /**
     * Atomically claim the user's window: SET-if-absent with the cooldown TTL. Returns true only if the
     * key did NOT already exist (i.e. the user was not in cooldown and now is). The atomicity closes the
     * race where two concurrent grant requests could both pass a separate "is in cooldown?" check.
     */
    public boolean tryStartCooldown(String userId) {
        Boolean acquired = redis.opsForValue().setIfAbsent(PREFIX + userId, "1", ttl);
        return Boolean.TRUE.equals(acquired);
    }
}
