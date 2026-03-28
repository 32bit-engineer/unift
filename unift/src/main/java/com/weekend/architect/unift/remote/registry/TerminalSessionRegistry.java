package com.weekend.architect.unift.remote.registry;

import com.weekend.architect.unift.common.cache.namedcache.TerminalSessionCache;
import com.weekend.architect.unift.remote.config.TerminalProperties;
import com.weekend.architect.unift.remote.model.TerminalSession;
import com.weekend.architect.unift.remote.service.TerminalEventPublisher;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PingMessage;

/**
 * Global in-memory registry of all active WebSocket terminal sessions.
 *
 * <h6>Responsibilities</h6>
 * <ol>
 *   <li>Atomic per-user session cap enforcement ({@link #registerIfUnderCap})</li>
 *   <li>Idempotent removal with guaranteed shell cleanup ({@link #remove})</li>
 *   <li>Activity tracking ({@link #touchActivity}) for idle detection</li>
 *   <li>Periodic ping to keep WebSocket connections alive through CDN/LB</li>
 *   <li>Idle reaper that force-closes sessions idle beyond {@code idleTimeoutMinutes}</li>
 * </ol>
 *
 * <h6>Backing store</h6>
 * <p>Uses an injected {@link TerminalSessionCache} (Caffeine-backed by default,
 * bounded to 10,000 entries).  No auto-TTL — the {@link #reapAndPing()} scheduler
 * owns eviction based on idle time.
 *
 * <h6>Thread-safety</h6>
 * <p>Delegated to {@link TerminalSessionCache}.  {@link #registerIfUnderCap} uses a
 * {@code synchronized} block to serialise the count-check + put and prevent TOCTOU.
 *
 * <h6>Concurrency model for WebSocket sends</h6>
 * <p>Both the pipe thread and the ping task send frames to the same
 * {@link org.springframework.web.socket.WebSocketSession}.  Callers <em>must</em>
 * wrap sessions with
 * {@link org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TerminalSessionRegistry {

    private final TerminalSessionCache store;
    private final TerminalProperties props;
    private final TerminalEventPublisher eventPublisher;

    /**
     * Atomically checks the per-user session cap and, if under the limit, registers
     * the given terminal session.
     */
    public synchronized boolean registerIfUnderCap(TerminalSession session) {
        long current = countByOwner(session.ownerId());
        if (current >= props.getMaxSessionsPerUser()) {
            log.warn(
                    "[terminal-registry] Per-user cap ({}) reached for user {} — rejecting new session {}",
                    props.getMaxSessionsPerUser(),
                    session.ownerId(),
                    session.wsSessionId());
            return false;
        }
        store.put(session.wsSessionId(), session);
        log.info(
                "[terminal-registry] Registered session {} for user {} (now {}/{})",
                session.wsSessionId(),
                session.ownerId(),
                current + 1,
                props.getMaxSessionsPerUser());
        return true;
    }

    public Optional<TerminalSession> get(String wsSessionId) {
        return Optional.ofNullable(store.getIfPresent(wsSessionId));
    }

    /**
     * Removes the session, closes the underlying shell, and publishes a Kafka event.
     * Idempotent.
     */
    public void remove(String wsSessionId, String reason) {
        TerminalSession session = store.remove(wsSessionId);
        if (session == null) return;

        try {
            session.shellSession().close();
        } catch (Exception e) {
            log.warn(
                    "[terminal-registry] Error closing shell for session {} (non-critical): {}",
                    wsSessionId,
                    e.getMessage());
        }

        eventPublisher.publishClosed(session, reason);
        log.info(
                "[terminal-registry] Removed session {} for user {} (reason: {})",
                wsSessionId,
                session.ownerId(),
                reason);
    }

    public void touchActivity(String wsSessionId) {
        TerminalSession session = store.getIfPresent(wsSessionId);
        if (session != null) session.touch();
    }

    public long countByOwner(UUID ownerId) {
        return store.values().stream().filter(s -> ownerId.equals(s.ownerId())).count();
    }

    public List<TerminalSession> all() {
        return List.copyOf(store.values());
    }

    public int size() {
        return (int) store.estimatedSize();
    }

    /**
     * Closes every terminal session whose parent SSH session matches {@code sshSessionId}.
     */
    public void closeAllBySshSession(String sshSessionId, String reason) {
        List<TerminalSession> affected = store.values().stream()
                .filter(s -> sshSessionId.equals(s.sshSessionId()))
                .toList();

        if (affected.isEmpty()) return;

        log.info(
                "[terminal-registry] Closing {} terminal session(s) because SSH session {} was closed (reason: {})",
                affected.size(),
                sshSessionId,
                reason);

        for (TerminalSession session : affected) {
            try {
                session.wsSession().close(new CloseStatus(4000, "SSH session closed: " + reason));
            } catch (IOException e) {
                log.debug(
                        "[terminal-registry] Could not send close frame to terminal {} (already gone): {}",
                        session.wsSessionId(),
                        e.getMessage());
            }
            remove(session.wsSessionId(), "ssh-session-closed");
        }
    }

    /**
     * Runs every {@code unift.terminal.reaper-interval-ms} (default: 30 s).
     * Sends a WebSocket ping to every session and reaps idle sessions.
     */
    @Scheduled(fixedDelayString = "${unift.terminal.reaper-interval-ms:30000}")
    public void reapAndPing() {
        if (store.estimatedSize() == 0) return;

        Duration idleLimit = Duration.ofMinutes(props.getIdleTimeoutMinutes());

        for (TerminalSession session : store.values()) {
            if (session.wsSession().isOpen()) {
                try {
                    session.wsSession().sendMessage(new PingMessage());
                } catch (IOException e) {
                    log.warn(
                            "[terminal-reaper] Ping failed for session {} — closing dead connection: {}",
                            session.wsSessionId(),
                            e.getMessage());
                    remove(session.wsSessionId(), "ping-failed");
                    continue;
                }
            }

            if (session.idleDuration().compareTo(idleLimit) > 0) {
                log.info(
                        "[terminal-reaper] Closing idle session {} for user {} (idle: {} min)",
                        session.wsSessionId(),
                        session.ownerId(),
                        session.idleDuration().toMinutes());
                try {
                    session.wsSession().close(new CloseStatus(4008, "Idle timeout"));
                } catch (IOException e) {
                    log.debug(
                            "[terminal-reaper] Failed to close WS for idle session {}: {}",
                            session.wsSessionId(),
                            e.getMessage());
                }
                remove(session.wsSessionId(), "idle-timeout");
            }
        }
    }
}
