package com.weekend.architect.unift.remote.repository;

import com.weekend.architect.unift.remote.dto.TransferHistoryStatsResponse;
import com.weekend.architect.unift.remote.model.TransferLog;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * JDBC repository for the {@code transfer_log} table.
 *
 * <p>Rows are written automatically by {@code RemoteConnectionServiceImpl} when a
 * download or upload reaches a terminal state (COMPLETED, FAILED, CANCELLED).
 * All writes are best-effort — callers should catch and log any {@link Exception}
 * rather than rolling back the originating transfer operation.
 */
@Slf4j
@Repository
@RequiredArgsConstructor
public class TransferLogRepository {

    private static final String PARAM_ID = "id";
    private static final String PARAM_USER_ID = "userId";

    private final NamedParameterJdbcTemplate jdbc;

    // -------------------------------------------------------------------------
    // Row mapper
    // -------------------------------------------------------------------------

    private TransferLog mapRow(ResultSet rs, int rowNum) throws SQLException {
        String rawUserId = rs.getString("user_id");
        return TransferLog.builder()
                .id(rs.getObject(PARAM_ID, UUID.class))
                .userId(rawUserId != null ? UUID.fromString(rawUserId) : null)
                .filename(rs.getString("filename"))
                .source(rs.getString("source"))
                .destination(rs.getString("destination"))
                .sizeBytes(nullableLong(rs, "size_bytes"))
                .avgSpeedBps(nullableLong(rs, "avg_speed_bps"))
                .durationMs(nullableLong(rs, "duration_ms"))
                .status(rs.getString("status"))
                .errorMessage(rs.getString("error_message"))
                .createdAt(toOffsetDateTime(rs.getTimestamp("created_at")))
                .build();
    }

    private static Long nullableLong(ResultSet rs, String col) throws SQLException {
        long val = rs.getLong(col);
        return rs.wasNull() ? null : val;
    }

    private static OffsetDateTime toOffsetDateTime(Timestamp ts) {
        return ts == null ? null : ts.toInstant().atOffset(ZoneOffset.UTC);
    }

    // -------------------------------------------------------------------------
    // Write operations
    // -------------------------------------------------------------------------

    /**
     * Inserts a new transfer log entry.
     *
     * <p>This method is best-effort.  Callers in {@code RemoteConnectionServiceImpl}
     * wrap this in a try-catch so a DB failure never surfaces to the API client.
     */
    public void save(TransferLog entry) {
        String sql =
                """
                INSERT INTO transfer_log (
                    id, user_id, filename, source, destination,
                    size_bytes, avg_speed_bps, duration_ms, status, error_message, created_at
                ) VALUES (
                    :id, :userId, :filename, :source, :destination,
                    :sizeBytes, :avgSpeedBps, :durationMs, :status, :errorMessage, NOW()
                )
                """;
        jdbc.update(
                sql,
                new MapSqlParameterSource()
                        .addValue(PARAM_ID, entry.getId())
                        .addValue(PARAM_USER_ID, entry.getUserId())
                        .addValue("filename", entry.getFilename())
                        .addValue("source", entry.getSource())
                        .addValue("destination", entry.getDestination())
                        .addValue("sizeBytes", entry.getSizeBytes())
                        .addValue("avgSpeedBps", entry.getAvgSpeedBps())
                        .addValue("durationMs", entry.getDurationMs())
                        .addValue("status", entry.getStatus())
                        .addValue("errorMessage", entry.getErrorMessage()));
    }

    /**
     * Deletes a transfer log entry, enforcing user ownership.
     *
     * @return {@code true} if a row was deleted
     */
    public boolean deleteById(UUID id, UUID userId) {
        String sql = "DELETE FROM transfer_log WHERE id = :id AND user_id = :userId";
        int rows = jdbc.update(
                sql, new MapSqlParameterSource().addValue(PARAM_ID, id).addValue(PARAM_USER_ID, userId));
        return rows > 0;
    }

    // -------------------------------------------------------------------------
    // Read operations
    // -------------------------------------------------------------------------

    /**
     * Finds a single transfer log entry by ID, enforcing user ownership.
     */
    public Optional<TransferLog> findById(UUID id, UUID userId) {
        String sql = "SELECT * FROM transfer_log WHERE id = :id AND user_id = :userId";
        return jdbc
                .query(
                        sql,
                        new MapSqlParameterSource().addValue(PARAM_ID, id).addValue(PARAM_USER_ID, userId),
                        this::mapRow)
                .stream()
                .findFirst();
    }

    /**
     * Returns a page of transfer log entries for a user, newest first.
     *
     * @param page 0-based page index
     * @param size number of entries per page (max 100)
     */
    public List<TransferLog> findByUserId(UUID userId, int page, int size) {
        int safeSize = Math.min(size, 100);
        int offset = page * safeSize;
        String sql =
                """
                SELECT * FROM transfer_log
                WHERE user_id = :userId
                ORDER BY created_at DESC
                LIMIT :size OFFSET :offset
                """;
        return jdbc.query(
                sql,
                new MapSqlParameterSource()
                        .addValue(PARAM_USER_ID, userId)
                        .addValue("size", safeSize)
                        .addValue("offset", offset),
                this::mapRow);
    }

    /**
     * Returns the total number of transfer log entries for a user (for pagination metadata).
     */
    public long countByUserId(UUID userId) {
        String sql = "SELECT COUNT(*) FROM transfer_log WHERE user_id = :userId";
        Long count = jdbc.queryForObject(sql, new MapSqlParameterSource(PARAM_USER_ID, userId), Long.class);
        return count != null ? count : 0L;
    }

    /**
     * Computes aggregate statistics for a user's transfer history.
     *
     * <p>Uses PostgreSQL {@code FILTER} clauses for a single-pass aggregation.
     */
    public TransferHistoryStatsResponse getStats(UUID userId) {
        String sql =
                """
                SELECT
                    COUNT(*)                                                AS total_transfers,
                    COUNT(*) FILTER (WHERE status = 'COMPLETED')           AS completed_transfers,
                    COUNT(*) FILTER (WHERE status = 'FAILED')              AS failed_transfers,
                    COUNT(*) FILTER (WHERE status = 'CANCELLED')           AS cancelled_transfers,
                    SUM(size_bytes)    FILTER (WHERE status = 'COMPLETED') AS total_bytes,
                    AVG(avg_speed_bps) FILTER (WHERE status = 'COMPLETED'
                                                 AND avg_speed_bps IS NOT NULL)  AS avg_speed
                FROM transfer_log
                WHERE user_id = :userId
                """;
        return jdbc.queryForObject(sql, new MapSqlParameterSource(PARAM_USER_ID, userId), (rs, rn) -> {
            Long avgSpeed = nullableLong(rs, "avg_speed");
            // AVG returns numeric in Postgres; round to long
            if (avgSpeed == null) {
                double d = rs.getDouble("avg_speed");
                avgSpeed = rs.wasNull() ? null : (long) d;
            }
            return TransferHistoryStatsResponse.builder()
                    .totalTransfers(rs.getLong("total_transfers"))
                    .completedTransfers(rs.getLong("completed_transfers"))
                    .failedTransfers(rs.getLong("failed_transfers"))
                    .cancelledTransfers(rs.getLong("cancelled_transfers"))
                    .totalBytesTransferred(nullableLong(rs, "total_bytes"))
                    .avgSpeedBps(avgSpeed)
                    .build();
        });
    }
}
