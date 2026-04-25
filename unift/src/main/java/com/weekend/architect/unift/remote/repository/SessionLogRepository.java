package com.weekend.architect.unift.remote.repository;

import static com.weekend.architect.unift.remote.repository.RepositoryConstants.PARAM_ID;

import com.weekend.architect.unift.remote.model.RemoteSession;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Persists a lightweight audit log of every remote session opened by UniFT users.
 *
 * <p>Unlike the in-memory {@code SessionRegistry}, rows in {@code session_log} survive server
 * restarts and session expiry, giving users (and admins) a history of connections including the
 * detected remote OS and connection labels.
 *
 * <p>All writes are best-effort — callers should catch and log any {@link Exception} rather than
 * rolling back the originating operation.
 */
@Slf4j
@Repository
@RequiredArgsConstructor
public class SessionLogRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * Inserts a new session-log row. Called once immediately after a session is successfully
     * established (and the OS has been detected).
     *
     * @param session the fully-connected session (with {@code remoteOs} already set)
     */
    public void save(RemoteSession session) {
        String sql = """
                INSERT INTO session_log (
                    id, user_id, label, protocol, host, port, username, remote_os, created_at
                ) VALUES (
                    :id, :userId, :label, :protocol, :host, :port, :username, :remoteOs, NOW()
                )
                """;
        try {
            jdbc.update(sql, buildParams(session));
            log.debug("[session-log] Saved session {} for user {}", session.getSessionId(), session.getOwnerId());
        } catch (Exception e) {
            log.warn("[session-log] Failed to save session {}: {}", session.getSessionId(), e.getMessage());
        }
    }

    /**
     * Stamps {@code closed_at = NOW()} when a session is explicitly closed by the user or reaped by
     * the TTL reaper.
     *
     * @param sessionId the session ID (UUID v7 string)
     */
    public void markClosed(String sessionId) {
        String sql = "UPDATE session_log SET closed_at = NOW() WHERE id = :id";
        try {
            jdbc.update(sql, new MapSqlParameterSource(PARAM_ID, UUID.fromString(sessionId)));
            log.debug("[session-log] Marked session {} as closed", sessionId);
        } catch (Exception e) {
            log.warn("[session-log] Failed to mark session {} closed: {}", sessionId, e.getMessage());
        }
    }

    private static MapSqlParameterSource buildParams(RemoteSession s) {
        return new MapSqlParameterSource()
                .addValue(PARAM_ID, UUID.fromString(s.getSessionId()))
                .addValue("userId", s.getOwnerId())
                .addValue("label", s.getLabel())
                .addValue("protocol", s.getProtocol().name())
                .addValue("host", s.getHost())
                .addValue("port", s.getPort())
                .addValue("username", s.getUsername())
                .addValue("remoteOs", s.getRemoteOs());
    }
}
