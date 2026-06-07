package com.varsha.order.service;

import com.varsha.order.model.OutboxEvent;
import com.varsha.order.model.OutboxStatus;
import com.varsha.order.repository.OutboxRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Periodically drains PENDING outbox events and hands each to the saga orchestrator. Kept thin and
 * non-transactional on purpose: per-event transactions live in {@link SagaOrchestrator#processOne}
 * (a separate bean, so the proxy applies), and one poisoned event can't abort the whole batch.
 */
@Component
public class OutboxPoller {

    private static final Logger log = LoggerFactory.getLogger(OutboxPoller.class);

    private final OutboxRepository outbox;
    private final SagaOrchestrator saga;

    public OutboxPoller(OutboxRepository outbox, SagaOrchestrator saga) {
        this.outbox = outbox;
        this.saga = saga;
    }

    @Scheduled(fixedDelayString = "${app.outbox.poll-interval-ms}")
    public void poll() {
        List<OutboxEvent> batch = outbox.findTop50ByStatusOrderByIdAsc(OutboxStatus.PENDING);
        for (OutboxEvent ev : batch) {
            try {
                saga.processOne(ev.getId());
            } catch (RuntimeException e) {
                // never let one event's unexpected failure stop the rest of the batch
                log.error("Saga failed for outbox event {}: {}", ev.getId(), e.getMessage(), e);
            }
        }
    }
}
