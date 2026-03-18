package com.weekend.architect.unift.remote.service.event;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.time.Instant;
import java.util.UUID;

/**
 * Sealed event hierarchy for terminal audit events published to Kafka.
 *
 * <p>Events are partitioned by {@code ownerId} so all events for a given user land on
 * the same partition, preserving chronological ordering for audit/compliance replay.
 *
 * <p>Jackson {@code @JsonTypeInfo} embeds an {@code "eventType"} discriminator field so
 * consumers can deserialize to the correct concrete record without extra configuration.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "eventType")
@JsonSubTypes({
    @JsonSubTypes.Type(value = TerminalEvent.SessionOpened.class, name = "terminal.session.opened"),
    @JsonSubTypes.Type(value = TerminalEvent.SessionClosed.class, name = "terminal.session.closed")
})
public sealed interface TerminalEvent permits TerminalEvent.SessionOpened, TerminalEvent.SessionClosed {

    /** The UniFT user who owns this terminal session. Used as the Kafka partition key. */
    UUID ownerId();

    /** Wall-clock instant when the event was created. */
    Instant timestamp();

    /**
     * Published when a terminal WebSocket session is successfully established
     * and the PTY shell is open.
     *
     * @param wsSessionId  Spring WebSocket session ID
     * @param sshSessionId Owning SSH session ID in SessionRegistry
     * @param ownerId      ID of the authenticated UniFT user
     * @param host         Remote SSH host (for audit context)
     * @param timestamp    Event creation instant
     */
    record SessionOpened(String wsSessionId, String sshSessionId, UUID ownerId, String host, Instant timestamp)
            implements TerminalEvent {}

    /**
     * Published when a terminal WebSocket session is closed for any reason.
     *
     * @param wsSessionId  Spring WebSocket session ID
     * @param sshSessionId Owning SSH session ID
     * @param ownerId      ID of the authenticated UniFT user
     * @param reason       Human-readable close reason (e.g., {@code "client-disconnected"}, {@code "idle-timeout"})
     * @param timestamp    Event creation instant
     */
    record SessionClosed(String wsSessionId, String sshSessionId, UUID ownerId, String reason, Instant timestamp)
            implements TerminalEvent {}
}
