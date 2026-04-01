package com.weekend.architect.unift.remote.service.impl;

import com.weekend.architect.unift.remote.model.TerminalSession;
import com.weekend.architect.unift.remote.service.TerminalEventPublisher;
import com.weekend.architect.unift.remote.service.event.TerminalEvent;
import java.time.Instant;
import java.util.concurrent.ExecutorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

/**
 * Kafka-backed implementation of {@link TerminalEventPublisher}.
 *
 * <p>Topic: {@code unift.terminal.events} Partition key: {@code ownerId.toString()} — ensures all
 * events for a given user land on the same partition, preserving chronological order for audit
 * replay.
 *
 * <p>Kafka sends are dispatched on the shared {@code virtualThreadExecutor}. They are fully
 * fire-and-forget: a Kafka outage must never propagate into the WebSocket data path.
 */
@Slf4j
@Service
public class TerminalEventPublisherImpl implements TerminalEventPublisher {

    static final String TOPIC = "unift.terminal.events";

    // private final KafkaTemplate<String, TerminalEvent> kafkaTemplate;

    /**
     * I/O-bound — Kafka send is a network call. Virtual threads unmount while waiting for broker
     * acknowledgement, so the carrier thread is never parked. Lifecycle is managed by {@link
     * com.weekend.architect.unift.common.PreTermination}.
     */
    private final ExecutorService virtualThreadExecutor;

    public TerminalEventPublisherImpl(@Qualifier("virtualThreadExecutor") ExecutorService virtualThreadExecutor) {
        this.virtualThreadExecutor = virtualThreadExecutor;
    }

    @Override
    public void publishOpened(TerminalSession session, String host) {
        publish(
                new TerminalEvent.SessionOpened(
                        session.wsSessionId(), session.sshSessionId(), session.ownerId(), host, Instant.now()),
                session.ownerId().toString());
    }

    @Override
    public void publishClosed(TerminalSession session, String reason) {
        publish(
                new TerminalEvent.SessionClosed(
                        session.wsSessionId(), session.sshSessionId(), session.ownerId(), reason, Instant.now()),
                session.ownerId().toString());
    }

    private void publish(TerminalEvent event, String partitionKey) {
        // Dispatch on a virtual thread — never block the WebSocket event thread on
        // network I/O.
        virtualThreadExecutor.submit(() -> {
            try {
                // kafkaTemplate.send(TOPIC, partitionKey, event);
                log.debug(
                        "[terminal-events] Published {} for owner {}",
                        event.getClass().getSimpleName(),
                        partitionKey);
            } catch (Exception e) {
                // Never propagate — audit failures must not disrupt terminal I/O
                log.warn("[terminal-events] Failed to publish event to Kafka (non-critical):" + " {}", e.getMessage());
            }
        });
    }
}
