package com.weekend.architect.unift.remote.registry;

import com.weekend.architect.unift.remote.config.TerminalProperties;
import com.weekend.architect.unift.remote.model.TerminalSession;
import com.weekend.architect.unift.remote.service.TerminalEventPublisher;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PingMessage;

/**
 * Global in-memory registry of all active WebSocket terminal sessions.
 *
 * <h2>Responsibilities</h2>
 * <ol>
 *   <li>Atomic per-user session cap enforcement ({@link #registerIfUnderCap})</li>
 *   <li>Idempotent removal with guaranteed shell cleanup ({@link #remove})</li>
 *   <li>Activity tracking ({@link #touchActivity}) for idle detection</li>
 *   <li>Periodic ping to keep WebSocket connections alive through CDN/LB</li>
 *   <li>Idle reaper that force-closes sessions idle beyond {@code idleTimeoutMinutes}</li>
 * </ol>
 *
 * <h2>Thread-safety</h2>
 * <p>The backing map is a {@link ConcurrentHashMap}.  {@link #registerIfUnderCap} uses a
 * {@code synchronized} block to make the count-check + put atomic; all other operations
 * are individually atomic and safe for concurrent use.
 *
 * <h2>Concurrency model for WebSocket sends</h2>
 * <p>Both the pipe thread (reading shell stdout) and this registry's ping task send frames
 * to the same {@link org.springframework.web.socket.WebSocketSession}.  Callers <strong>must</strong>
 * pass a {@link org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator}-wrapped
 * session when creating a {@link TerminalSession} so that concurrent sends are serialized safely.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TerminalSessionRegistry {

    /** wsSessionId → live terminal session */
    private final ConcurrentHashMap<String, TerminalSession> store = new ConcurrentHashMap<>();

    private final TerminalProperties props;
    private final TerminalEventPublisher eventPublisher;

    /**
     * Atomically checks the per-user session cap and, if under the limit, registers
     * the given terminal session.
     *
     * <p>The count-check and put are serialized via a {@code synchronized} block on
     * {@code this} to prevent a TOCTOU race where two concurrent connection attempts
     * from the same user both pass the cap check and both get registered.
     *
     * @param session the newly created terminal session
     * @return {@code true} if registered; {@code false} if the per-user cap was exceeded
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

    /**
     * Returns the terminal session for the given WebSocket session ID.
     *
     * @param wsSessionId Spring WebSocket session ID
     */
    public Optional<TerminalSession> get(String wsSessionId) {
        return Optional.ofNullable(store.get(wsSessionId));
    }

    /**
     * Removes the terminal session from the registry, closes the underlying shell,
     * and publishes a {@code terminal.session.closed} Kafka event.
     *
     * <p>Idempotent — safe to call multiple times (e.g., from both the pipe thread
     * {@code finally} block and {@code afterConnectionClosed}).
     *
     * @param wsSessionId Spring WebSocket session ID
     * @param reason      human-readable close reason for the audit event
     */
    public void remove(String wsSessionId, String reason) {
        TerminalSession session = store.remove(wsSessionId);
        if (session == null) {
            return; // already removed — idempotent
        }

        // Close the JSch ChannelShell; suppress exceptions so cleanup always finishes
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

    /**
     * Resets the idle timer for the given WebSocket session.
     * Called on every inbound input message and on every pong frame received.
     *
     * @param wsSessionId Spring WebSocket session ID
     */
    public void touchActivity(String wsSessionId) {
        TerminalSession session = store.get(wsSessionId);
        if (session != null) {
            session.touch();
        }
    }

    /**
     * Returns the number of active terminal sessions owned by the given user.
     */
    public long countByOwner(UUID ownerId) {
        return store.values().stream().filter(s -> ownerId.equals(s.ownerId())).count();
    }

    /** Returns all active terminal sessions — used for admin/diagnostic endpoints. */
    public List<TerminalSession> all() {
        return List.copyOf(store.values());
    }

    /** Returns the total number of active terminal sessions across all users. */
    public int size() {
        return store.size();
    }

    /**
     * Closes every terminal WebSocket session whose parent SSH session matches
     * {@code sshSessionId}. Called by {@link SessionRegistry} whenever an SSH
     * session is torn down so that terminal sub-sessions are never left dangling.
     *
     * <p>The matching sessions are collected into a snapshot list first to avoid
     * mutating the {@link ConcurrentHashMap} while iterating over its values.
     *
     * @param sshSessionId the SSH session that was closed
     * @param reason       human-readable reason forwarded to the WS close frame and audit log
     */
    public void closeAllBySshSession(String sshSessionId, String reason) {
        List<TerminalSession> affected = store.values().stream()
                .filter(s -> sshSessionId.equals(s.sshSessionId()))
                .toList();

        if (affected.isEmpty()) {
            return;
        }

        log.info(
                "[terminal-registry] Closing {} terminal session(s) because SSH session {} was closed (reason: {})",
                affected.size(),
                sshSessionId,
                reason);

        for (TerminalSession session : affected) {
            // Notify the browser so it can show a "connection lost" message instead of hanging.
            try {
                session.wsSession().close(new CloseStatus(4000, "SSH session closed: " + reason));
            } catch (IOException e) {
                log.debug(
                        "[terminal-registry] Could not send close frame to terminal {} (already gone): {}",
                        session.wsSessionId(),
                        e.getMessage());
            }
            // Clean up shell + publish Kafka event
            remove(session.wsSessionId(), "ssh-session-closed");
        }
    }

    /**
     * Runs every {@code unift.terminal.reaper-interval-ms} (default: 30 s).
     *
     * <p>Two jobs in one pass:
     * <ol>
     *   <li><b>Ping</b> — sends a WebSocket {@link PingMessage} to every active session.
     *       Browsers auto-respond with a Pong; the {@code handlePongMessage} override in
     *       {@code TerminalWebSocketHandler} calls {@link #touchActivity}.
     *       If the send itself fails (dead TCP connection), the session is removed immediately.</li>
     *   <li><b>Reap</b> — closes sessions whose {@code idleDuration()} exceeds
     *       {@code idleTimeoutMinutes}.  A session that is sending pongs stays alive;
     *       a zombie session that stopped responding will be idle-reaped.</li>
     * </ol>
     */
    @Scheduled(fixedDelayString = "${unift.terminal.reaper-interval-ms:30000}")
    public void reapAndPing() {
        if (store.isEmpty()) {
            return;
        }

        Duration idleLimit = Duration.ofMinutes(props.getIdleTimeoutMinutes());

        for (TerminalSession session : store.values()) {
            // --- Send ping to keep the connection alive through CDN/LB ---
            if (session.wsSession().isOpen()) {
                try {
                    session.wsSession().sendMessage(new PingMessage());
                } catch (IOException e) {
                    log.warn(
                            "[terminal-reaper] Ping failed for session {} — closing dead connection: {}",
                            session.wsSessionId(),
                            e.getMessage());
                    remove(session.wsSessionId(), "ping-failed");
                    continue; // already removed, skip idle check
                }
            }

            // --- Reap idle sessions ---
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
