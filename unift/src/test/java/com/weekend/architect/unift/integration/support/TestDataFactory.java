package com.weekend.architect.unift.integration.support;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Utility for inserting controlled test fixtures directly into the integration-test PostgreSQL
 * database.
 *
 * <p>Only used when building test pre-conditions that cannot be driven through the public API (e.g.
 * pre-seeding transfer_log rows for history query tests). All other data setup must go through the
 * real API endpoints.
 */
public class TestDataFactory {

    private final JdbcTemplate jdbc;

    public TestDataFactory(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Inserts a {@code transfer_log} row with minimal fields. {@code session_id} and {@code
     * username} are left {@code NULL}.
     *
     * @param userId   owning user ID
     * @param filename file name to record
     * @param status   terminal state: COMPLETED, FAILED, or CANCELLED
     * @return the generated log entry ID
     */
    public UUID insertTransferLog(UUID userId, String filename, String status) {
        return insertTransferLogFull(userId, filename, status, 1024L, null, null, null);
    }

    /**
     * Inserts a {@code transfer_log} row with all transfer metrics. {@code session_id} and {@code
     * username} are left {@code NULL}.
     *
     * @param userId      owning user ID
     * @param filename    file name
     * @param status      COMPLETED | FAILED | CANCELLED
     * @param sizeBytes   bytes transferred
     * @param avgSpeedBps average speed (nullable)
     * @param durationMs  wall-clock duration in ms (nullable)
     * @param errorMsg    error detail for FAILED entries (nullable)
     * @return the generated log entry ID
     */
    public UUID insertTransferLogFull(
            UUID userId,
            String filename,
            String status,
            Long sizeBytes,
            Long avgSpeedBps,
            Long durationMs,
            String errorMsg) {
        return insertTransferLogWithSession(
                userId, filename, status, sizeBytes, avgSpeedBps, durationMs, errorMsg, null, null);
    }

    /**
     * Inserts a {@code transfer_log} row with all fields, including session context.
     *
     * <p>Use this overload when testing the {@code ?sessionId} or {@code ?username} filter
     * parameters on {@code GET /api/transfers/history}.
     *
     * @param userId      owning user ID
     * @param filename    file name
     * @param status      COMPLETED | FAILED | CANCELLED
     * @param sizeBytes   bytes transferred (nullable)
     * @param avgSpeedBps average speed in bytes/s (nullable)
     * @param durationMs  wall-clock duration in ms (nullable)
     * @param errorMsg    error detail for FAILED entries (nullable)
     * @param sessionId   session that initiated the transfer (nullable)
     * @param username    SSH username used for the session (nullable)
     * @return the generated log entry ID
     */
    public UUID insertTransferLogWithSession(
            UUID userId,
            String filename,
            String status,
            Long sizeBytes,
            Long avgSpeedBps,
            Long durationMs,
            String errorMsg,
            String sessionId,
            String username) {
        UUID id = UUID.randomUUID();
        jdbc.update(
                """
                INSERT INTO transfer_log
                    (id, user_id, session_id, username, filename, source, destination,
                     size_bytes, avg_speed_bps, duration_ms, status, error_message, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                """,
                id,
                userId,
                sessionId,
                username,
                filename,
                "sftp://host/" + filename,
                "client/" + filename,
                sizeBytes,
                avgSpeedBps,
                durationMs,
                status,
                errorMsg);
        return id;
    }

    /** Removes all {@code transfer_log} rows owned by the given user. */
    public void deleteTransferLogsByUser(UUID userId) {
        jdbc.update("DELETE FROM transfer_log WHERE user_id = ?", userId);
    }
}
