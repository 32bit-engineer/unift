package com.weekend.architect.unift.remote.registry;

import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.enums.SessionState;
import com.weekend.architect.unift.remote.exception.SessionExpiredException;
import com.weekend.architect.unift.remote.exception.SessionNotFoundException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * In-memory registry of all active {@link RemoteConnection} instances.
 *
 * <h2>Thread-safety</h2>
 * <p>The backing map is a {@link ConcurrentHashMap}, making all public
 * methods safe to call from concurrent request threads without explicit
 * locking. The {@link #reapExpiredSessions()} method runs on a separate
 * scheduler thread and uses the same map.
 *
 * <h2>Session reaper</h2>
 * <p>The {@code @Scheduled} method runs every
 * {@code unift.remote.reaper-interval-ms} milliseconds (default: 60 s),
 * identifies sessions whose TTL has elapsed, and closes + removes them.
 *
 * <h2>Terminal cascade</h2>
 * <p>Every removal path ({@link #remove}, {@link #reapExpiredSessions},
 * {@link #clearAllSessions}) automatically closes all terminal WebSocket
 * sub-sessions linked to the departing SSH session via
 * {@link TerminalSessionRegistry#closeAllBySshSession}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SessionRegistry {

    /** sessionId → live connection */
    private final ConcurrentHashMap<String, RemoteConnection> store = new ConcurrentHashMap<>();

    private final TerminalSessionRegistry terminalSessionRegistry;

    /**
     * Registers a new (already-connected) session.
     *
     * @param connection the live connection; its {@code sessionId} is used as the key
     */
    public void register(RemoteConnection connection) {
        store.put(connection.getSessionId(), connection);
        log.info("[registry] Registered session {}", connection.getSessionId());
    }

    /**
     * Retrieves the connection for the given session ID.
     *
     * @throws SessionNotFoundException if the session does not exist
     * @throws SessionExpiredException  if the session TTL has elapsed
     */
    public RemoteConnection require(String sessionId) {
        RemoteConnection conn = store.get(sessionId);
        if (conn == null) {
            throw new SessionNotFoundException(sessionId);
        }
        if (conn.getSession().isExpired()) {
            remove(sessionId);
            throw new SessionExpiredException(sessionId);
        }
        return conn;
    }

    /**
     * Closes the connection and removes it from the registry.
     * Also closes all terminal WebSocket sub-sessions linked to this SSH session.
     * Safe to call multiple times (idempotent).
     */
    public void remove(String sessionId) {
        RemoteConnection conn = store.remove(sessionId);
        if (conn != null) {
            // Cascade first — close terminal sub-sessions before the SSH transport drops.
            // This lets the browser receive a clean WS close frame (4000) rather than
            // a raw TCP disconnect.
            terminalSessionRegistry.closeAllBySshSession(sessionId, "ssh-session-removed");
            try {
                conn.close();
            } catch (Exception e) {
                log.warn("[registry] Error closing session {}: {}", sessionId, e.getMessage());
            }
            log.info("[registry] Removed session {}", sessionId);
        }
    }

    /**
     * Returns all active sessions owned by the given user.
     */
    public List<RemoteConnection> getByOwner(UUID ownerId) {
        return store.values().stream()
                .filter(c -> ownerId.equals(c.getSession().getOwnerId()))
                .filter(c -> c.getSession().getState() == SessionState.ACTIVE)
                .toList();
    }

    /** Returns the total number of registered sessions. */
    public int size() {
        return store.size();
    }

    /**
     * Scheduled task that closes and evicts expired sessions.
     * Rate is driven by {@code unift.remote.reaper-interval-ms}.
     */
    @Scheduled(fixedRateString = "${unift.remote.reaper-interval-ms:60000}")
    public void reapExpiredSessions() {
        int count = 0;
        for (Map.Entry<String, RemoteConnection> entry : store.entrySet()) {
            RemoteConnection conn = entry.getValue();
            if (conn.getSession().isExpired()) {
                conn.getSession().setState(SessionState.EXPIRED);
                remove(entry.getKey());
                count++;
            }
        }
        if (count > 0) {
            log.info("[reaper] Reaped {} expired session(s)", count);
        }
    }

    public void clearAllSessions() {
        // Snapshot the keys — remove() mutates the map and cascades to terminal sessions.
        List.copyOf(store.keySet()).forEach(this::remove);
    }
}
