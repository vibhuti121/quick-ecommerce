package com.varsha.catalog.repository;

import com.varsha.catalog.model.NotifySignup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface NotifySignupRepository extends JpaRepository<NotifySignup, Long> {

    /** Idempotency check — one signup per (topic, phone), mirrors the client-side dedupe. */
    boolean existsByTopicAndPhone(String topic, String phone);

    Optional<NotifySignup> findByTopicAndPhone(String topic, String phone);

    /** Admin list — newest signups first. */
    List<NotifySignup> findAllByOrderByCreatedAtDesc();

    /** Admin Demand dashboard — the latest leads, capped (full list still at findAllBy…). */
    List<NotifySignup> findTop50ByOrderByCreatedAtDesc();

    /** Public, read-only count of signups for a topic (e.g. the honey drop list size). */
    long countByTopic(String topic);

    /** Distinct headcount on the waitlist (one person can want many fruits → many rows, one phone). */
    @Query("select count(distinct s.phone) from NotifySignup s")
    long countDistinctPeople();

    /** Demand per topic (fruit slug / umbrella key), most-wanted first — the dashboard's headline. */
    @Query("""
            select s.topic as topic, count(s) as signups, count(distinct s.phone) as people
            from NotifySignup s
            group by s.topic
            order by count(s) desc""")
    List<TopicDemandRow> demandByTopic();

    /** Demand per state/UT (rows with no resolved state are excluded), most first. */
    @Query("""
            select s.state as state, count(s) as signups
            from NotifySignup s
            where s.state is not null
            group by s.state
            order by count(s) desc""")
    List<StateDemandRow> demandByState();

    /** Projection: one row of the per-topic demand aggregate. */
    interface TopicDemandRow {
        String getTopic();
        long getSignups();
        long getPeople();
    }

    /** Projection: one row of the per-state demand aggregate. */
    interface StateDemandRow {
        String getState();
        long getSignups();
    }
}
