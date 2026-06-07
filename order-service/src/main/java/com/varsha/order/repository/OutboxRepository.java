package com.varsha.order.repository;

import com.varsha.order.model.OutboxEvent;
import com.varsha.order.model.OutboxStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OutboxRepository extends JpaRepository<OutboxEvent, Long> {
    /** Oldest-first batch of unprocessed events for the poller to drain. */
    List<OutboxEvent> findTop50ByStatusOrderByIdAsc(OutboxStatus status);
}
