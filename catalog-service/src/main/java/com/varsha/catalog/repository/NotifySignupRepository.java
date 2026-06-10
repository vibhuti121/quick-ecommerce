package com.varsha.catalog.repository;

import com.varsha.catalog.model.NotifySignup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NotifySignupRepository extends JpaRepository<NotifySignup, Long> {

    /** Idempotency check — one signup per (topic, phone), mirrors the client-side dedupe. */
    boolean existsByTopicAndPhone(String topic, String phone);

    Optional<NotifySignup> findByTopicAndPhone(String topic, String phone);

    /** Admin list — newest signups first. */
    List<NotifySignup> findAllByOrderByCreatedAtDesc();
}
