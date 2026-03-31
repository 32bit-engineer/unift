package com.weekend.architect.unift.remote.model;

import com.weekend.architect.unift.remote.core.RemoteShell;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.web.socket.WebSocketSession;

/**
 * Immutable value object representing one live WebSocket terminal session.
 *
 * <p>{@code lastActivityAt} uses an {@link AtomicReference} so the reaper thread
 * and the WebSocket I/O threads can both update it without locking the entire record.
 *
 * <h6>Lifecycle</h6>
 * <pre>
 *   afterConnectionEstablished  → TerminalSession.create() → register in TerminalSessionRegistry
 *   handleTextMessage / pong    → touch() updates lastActivityAt
 *   afterConnectionClosed       → TerminalSessionRegistry.remove() closes shellSession
 *   reapIdleSessions (reaper)   → closes WS + calls remove() if idle &gt; timeout
 * </pre>
 *
 * @param wsSessionId      Spring WebSocket session ID (registry key)
 * @param sshSessionId     Owning SSH session ID in {@link com.weekend.architect.unift.remote.registry.SessionRegistry}
 * @param ownerId          UUID of the authenticated UniFT user
 * @param openedAt         Wall-clock instant when the shell was opened
 * @param lastActivityAt   Mutable; updated on every input, output, or pong
 * @param shellSession     Live JSch {@link RemoteShell.ShellSession}; closed on registry removal
 * @param wsSession        The thread-safe {@link WebSocketSession} wrapper for concurrent sends
 */
public record TerminalSession(
        String wsSessionId,
        String sshSessionId,
        UUID ownerId,
        Instant openedAt,
        AtomicReference<Instant> lastActivityAt,
        RemoteShell.ShellSession shellSession,
        WebSocketSession wsSession) {

    /**
     * Factory method. Sets {@code openedAt} and {@code lastActivityAt} to now.
     */
    public static TerminalSession create(
            String wsSessionId,
            String sshSessionId,
            UUID ownerId,
            RemoteShell.ShellSession shellSession,
            WebSocketSession wsSession) {
        Instant now = Instant.now();
        return new TerminalSession(
                wsSessionId, sshSessionId, ownerId, now, new AtomicReference<>(now), shellSession, wsSession);
    }

    /** Updates the last-activity timestamp to now. Thread-safe. */
    public void touch() {
        lastActivityAt.set(Instant.now());
    }

    /** Returns how long this session has been idle. */
    public Duration idleDuration() {
        return Duration.between(lastActivityAt.get(), Instant.now());
    }
}
