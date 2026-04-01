package com.weekend.architect.unift.remote.registry;

import com.weekend.architect.unift.common.cache.namedcache.SshConnectionCache;
import com.weekend.architect.unift.remote.analytics.SessionMetricsStore;
import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.docker.DockerClientPool;
import com.weekend.architect.unift.remote.enums.SessionState;
import com.weekend.architect.unift.remote.exception.SessionExpiredException;
import com.weekend.architect.unift.remote.exception.SessionNotFoundException;
import com.weekend.architect.unift.remote.kubernetes.K8sClientPool;
import com.weekend.architect.unift.remote.kubernetes.K8sLogStreamRegistry;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * In-memory registry of all active {@link RemoteConnection} instances.
 *
 * <h6>Backing store</h6>
 *
 * <p>Uses an injected {@link SshConnectionCache} (Caffeine-backed by default, bounded to 10,000
 * entries). No automatic TTL — the {@link #reapExpiredSessions()} scheduler manages eviction based
 * on {@link com.weekend.architect.unift.remote.model.RemoteSession#isExpired()}.
 *
 * <p>To swap to Redis: update {@link SshConnectionCache} to delegate to a {@code
 * RedisRegistryCache} instance. No changes needed here.
 *
 * <h6>Thread-safety</h6>
 *
 * <p>Delegated entirely to the {@link SshConnectionCache} implementation.
 *
 * <h6>Terminal cascade</h6>
 *
 * <p>Every removal path ({@link #remove}, {@link #reapExpiredSessions}, {@link #clearAllSessions})
 * closes all WebSocket sub-sessions linked to the departing SSH session via {@link
 * TerminalSessionRegistry#closeAllBySshSession}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SessionRegistry {

    /** sessionId → live connection; bounded by safety cap, TTL managed by the reaper */
    private final SshConnectionCache store;

    private final SessionMetricsStore metricsStore;
    private final TransferRegistry transferRegistry;
    private final K8sLogStreamRegistry k8sLogStreamRegistry;
    private final TerminalSessionRegistry terminalSessionRegistry;

    /**
     * Evicts the cached Fabric8 KubernetesClient (+ any SSH port-forward tunnel) when the parent
     * SSH session is closed. Injected lazily to avoid a circular dependency.
     */
    private final K8sClientPool k8sClientPool;

    /**
     * Evicts the cached DockerClient (+ any SSH port-forward tunnel) when the parent SSH session is
     * closed.
     */
    private final DockerClientPool dockerClientPool;

    /** Registers a new (already-connected) session. */
    public void register(RemoteConnection connection) {
        store.put(connection.getSessionId(), connection);
        log.info("[registry] Registered session {}", connection.getSessionId());
    }

    /**
     * Atomically checks the per-user session cap and, if under the limit, registers the given
     * connection. Prevents the TOCTOU race where two concurrent openSession calls both pass the cap
     * check and both register, exceeding the intended limit.
     *
     * @param connection the already-connected session to register
     * @param ownerId the user who owns this session
     * @param maxSessions per-user session cap
     * @return true if registered, false if cap would be exceeded
     */
    public synchronized boolean registerIfUnderCap(RemoteConnection connection, UUID ownerId, int maxSessions) {
        long current = getByOwner(ownerId).size();
        if (current >= maxSessions) {
            log.warn(
                    "[registry] Per-user session cap ({}) reached for user {} — rejecting session" + " {}",
                    maxSessions,
                    ownerId,
                    connection.getSessionId());
            return false;
        }
        store.put(connection.getSessionId(), connection);
        log.info(
                "[registry] Registered session {} for user {} (now {}/{})",
                connection.getSessionId(),
                ownerId,
                current + 1,
                maxSessions);
        return true;
    }

    /**
     * Looks up the connection for the given session ID without throwing.
     *
     * @return the connection wrapped in an Optional, or empty if not registered or expired
     */
    public Optional<RemoteConnection> find(String sessionId) {
        RemoteConnection conn = store.getIfPresent(sessionId);
        if (conn == null) {
            return Optional.empty();
        }
        if (conn.getSession().isExpired()) {
            remove(sessionId);
            return Optional.empty();
        }
        return Optional.of(conn);
    }

    /**
     * Retrieves the connection for the given session ID.
     *
     * @throws SessionNotFoundException if the session does not exist
     * @throws SessionExpiredException if the session TTL has elapsed
     */
    public RemoteConnection require(String sessionId) {
        RemoteConnection conn = store.getIfPresent(sessionId);
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
     * Closes the connection and removes it from the registry. Also cascades to terminal WebSocket
     * sub-sessions. Idempotent.
     */
    public void remove(String sessionId) {
        RemoteConnection conn = store.remove(sessionId);
        if (conn != null) {
            reapAllPoolsAndRegistries(sessionId);
            try {
                conn.close();
            } catch (Exception e) {
                log.warn("[registry] Error closing session {}: {}", sessionId, e.getMessage());
            }
            metricsStore.removeSession(sessionId);
            log.info("[registry] Removed session {}", sessionId);
        }
    }

    private void reapAllPoolsAndRegistries(String sessionId) {
        // Cascade first — clean WS close frame before the SSH transport drops.
        terminalSessionRegistry.closeAllBySshSession(sessionId, "ssh-session-removed");
        // Tear down Fabric8 client + any SSH port-forward tunnel for this session.
        k8sClientPool.evict(sessionId);
        // Tear down Docker client + SSH tunnel for this session.
        dockerClientPool.evict(sessionId);
        k8sLogStreamRegistry.closeAllBySession(sessionId);
        transferRegistry.removeBySession(sessionId);
    }

    /** Returns all active sessions owned by the given user. */
    public List<RemoteConnection> getByOwner(UUID ownerId) {
        return store.values().stream()
                .filter(c -> ownerId.equals(c.getSession().getOwnerId()))
                .filter(c -> c.getSession().getState() == SessionState.ACTIVE)
                .toList();
    }

    /**
     * Returns the first active session that was opened from the given saved-host entry, or an empty
     * Optional if no such session currently exists.
     */
    public Optional<RemoteConnection> findBySavedHostId(UUID savedHostId) {
        return store.values().stream()
                .filter(c -> savedHostId.equals(c.getSession().getSavedHostId()))
                .filter(c -> c.getSession().getState() == SessionState.ACTIVE)
                .findFirst();
    }

    /** Returns the approximate number of registered sessions. */
    public int size() {
        return (int) store.estimatedSize();
    }

    /**
     * Scheduled task that closes and evicts expired sessions. Rate driven by {@code
     * unift.remote.reaper-interval-ms}.
     */
    @Scheduled(fixedRateString = "${unift.remote.reaper-interval-ms:60000}")
    public void reapExpiredSessions() {
        int count = 0;
        for (Map.Entry<String, RemoteConnection> entry : store.entries()) {
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
        // Snapshot keys first — remove() mutates the map and cascades to terminal
        // sessions.
        List.copyOf(store.keys()).forEach(this::remove);
    }
}
