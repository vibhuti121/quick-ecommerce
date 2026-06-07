package com.varsha.cart.repository;

import com.varsha.cart.model.Cart;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.util.Optional;

@Repository
public class CartRepository {

    private static final String KEY_PREFIX = "cart:";

    private final RedisTemplate<String, Cart> redis;
    private final Duration ttl;

    public CartRepository(RedisTemplate<String, Cart> redis,
                          @Value("${app.cart-ttl-days}") long ttlDays) {
        this.redis = redis;
        this.ttl = Duration.ofDays(ttlDays);
    }

    private String key(String userId) {
        return KEY_PREFIX + userId;
    }

    public Optional<Cart> find(String userId) {
        return Optional.ofNullable(redis.opsForValue().get(key(userId)));
    }

    /** Persist the cart and (re)set its inactivity TTL. */
    public void save(Cart cart) {
        redis.opsForValue().set(key(cart.getUserId()), cart, ttl);
    }

    public void delete(String userId) {
        redis.delete(key(userId));
    }
}
