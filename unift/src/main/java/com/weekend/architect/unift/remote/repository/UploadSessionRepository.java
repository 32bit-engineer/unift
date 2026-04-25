package com.weekend.architect.unift.remote.repository;

import static com.weekend.architect.unift.remote.repository.RepositoryConstants.PARAM_ID;
import static com.weekend.architect.unift.remote.repository.RepositoryConstants.PARAM_USER_ID;

import com.weekend.architect.unift.remote.enums.UploadSessionStatus;
import com.weekend.architect.unift.remote.model.UploadSession;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * JDBC repository for the {@code upload_sessions} table.
 *
 * <p>PostgreSQL {@code INT[]} columns are read via {@link java.sql.Array} and written as PostgreSQL
 * array literals (e.g. {@code '{0,1,2}'::integer[]}) to avoid the need for a live {@link
 * java.sql.Connection} when constructing named parameters.
 */
@Slf4j
@Repository
@RequiredArgsConstructor
public class UploadSessionRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private UploadSession mapRow(ResultSet rs, int rowNum) throws SQLException {
        return UploadSession.builder()
                .id(rs.getObject(PARAM_ID, UUID.class))
                .userId(rs.getObject("user_id", UUID.class))
                .filename(rs.getString("filename"))
                .totalSize(rs.getLong("total_size"))
                .chunkSize(rs.getInt("chunk_size"))
                .totalChunks(rs.getInt("total_chunks"))
                .receivedChunks(readIntArray(rs, "received_chunks"))
                .destinationPath(rs.getString("destination_path"))
                .status(UploadSessionStatus.valueOf(rs.getString("status")))
                .createdAt(toOffsetDateTime(rs.getTimestamp("created_at")))
                .expiresAt(toOffsetDateTime(rs.getTimestamp("expires_at")))
                .build();
    }

    /** Converts a PostgreSQL array result-set column to a {@code List<Integer>}. */
    private static List<Integer> readIntArray(ResultSet rs, String column) throws SQLException {
        Array arr = rs.getArray(column);
        List<Integer> result = new ArrayList<>();
        if (arr != null) {
            Object[] elements = (Object[]) arr.getArray();
            for (Object el : elements) {
                result.add(((Number) el).intValue());
            }
        }
        return result;
    }

    private static OffsetDateTime toOffsetDateTime(Timestamp ts) {
        return ts == null ? null : ts.toInstant().atOffset(ZoneOffset.UTC);
    }

    /**
     * Inserts a new upload session.
     *
     * <p>The {@code received_chunks} column is initialised to an empty array. {@code expires_at}
     * defaults to {@code NOW() + INTERVAL '48 hours'} per DDL.
     */
    public void save(UploadSession session) {
        String sql = """
                INSERT INTO upload_sessions (
                    id, user_id, filename, total_size, chunk_size, total_chunks,
                    received_chunks, destination_path, status, created_at, expires_at
                ) VALUES (
                    :id, :userId, :filename, :totalSize, :chunkSize, :totalChunks,
                    '{}'::integer[], :destinationPath, :status, NOW(), NOW() + INTERVAL '48 hours'
                )
                """;
        jdbc.update(
                sql,
                new MapSqlParameterSource()
                        .addValue(PARAM_ID, session.getId())
                        .addValue(PARAM_USER_ID, session.getUserId())
                        .addValue("filename", session.getFilename())
                        .addValue("totalSize", session.getTotalSize())
                        .addValue("chunkSize", session.getChunkSize())
                        .addValue("totalChunks", session.getTotalChunks())
                        .addValue("destinationPath", session.getDestinationPath())
                        .addValue("status", session.getStatus().name()));
    }

    /**
     * Atomically appends {@code chunkIndex} to {@code received_chunks} and advances the status.
     *
     * <ul>
     *   <li>If the chunk is already present, or the session is not PENDING/IN_PROGRESS, or the
     *       session belongs to a different user, <em>no rows are updated</em>.
     *   <li>When the number of received chunks after appending equals {@code total_chunks} the
     *       status is set to {@code COMPLETED} in the same statement.
     *   <li>Otherwise the status is set to {@code IN_PROGRESS}.
     * </ul>
     *
     * @return {@code true} if a row was updated (chunk was new and session was active)
     */
    public boolean acknowledgeChunk(UUID sessionId, UUID userId, int chunkIndex) {
        String sql = """
                UPDATE upload_sessions
                SET
                    received_chunks = array_append(received_chunks, CAST(:chunkIndex AS integer)),
                    status = CASE
                        WHEN cardinality(array_append(received_chunks, CAST(:chunkIndex AS integer))) >= total_chunks
                            THEN 'COMPLETED'
                        ELSE 'IN_PROGRESS'
                    END
                WHERE id        = :id
                  AND user_id   = :userId
                  AND status    IN ('PENDING', 'IN_PROGRESS')
                  AND expires_at > NOW()
                  AND NOT (CAST(:chunkIndex AS integer) = ANY(received_chunks))
                """;
        int rows = jdbc.update(
                sql,
                new MapSqlParameterSource()
                        .addValue(PARAM_ID, sessionId)
                        .addValue(PARAM_USER_ID, userId)
                        .addValue("chunkIndex", chunkIndex));
        return rows > 0;
    }

    /**
     * Updates the status of a session (e.g. to FAILED or EXPIRED). Ownership is enforced via the
     * {@code user_id} filter.
     */
    public boolean updateStatus(UUID sessionId, UUID userId, UploadSessionStatus status) {
        String sql = """
                UPDATE upload_sessions SET status = :status
                WHERE id = :id AND user_id = :userId
                """;
        int rows = jdbc.update(
                sql,
                new MapSqlParameterSource()
                        .addValue(PARAM_ID, sessionId)
                        .addValue(PARAM_USER_ID, userId)
                        .addValue("status", status.name()));
        return rows > 0;
    }

    /**
     * Deletes an upload session. Returns {@code false} if not found or not owned by {@code userId}.
     */
    public boolean deleteById(UUID sessionId, UUID userId) {
        String sql = "DELETE FROM upload_sessions WHERE id = :id AND user_id = :userId";
        int rows = jdbc.update(
                sql, new MapSqlParameterSource().addValue(PARAM_ID, sessionId).addValue(PARAM_USER_ID, userId));
        return rows > 0;
    }

    /** Finds a session by ID, enforcing user ownership. */
    public Optional<UploadSession> findById(UUID sessionId, UUID userId) {
        String sql = "SELECT * FROM upload_sessions WHERE id = :id AND user_id = :userId";
        return jdbc
                .query(
                        sql,
                        new MapSqlParameterSource()
                                .addValue(PARAM_ID, sessionId)
                                .addValue(PARAM_USER_ID, userId),
                        this::mapRow)
                .stream()
                .findFirst();
    }

    /**
     * Returns all sessions for a user, newest first.
     *
     * @param status optional status filter; {@code null} returns sessions with any status
     */
    public List<UploadSession> findByUserId(UUID userId, UploadSessionStatus status) {
        String sql = status != null
                ? "SELECT * FROM upload_sessions WHERE user_id = :userId AND status ="
                        + " :status ORDER BY created_at DESC"
                : "SELECT * FROM upload_sessions WHERE user_id = :userId ORDER BY" + " created_at DESC";
        MapSqlParameterSource params = new MapSqlParameterSource().addValue(PARAM_USER_ID, userId);
        if (status != null) {
            params.addValue("status", status.name());
        }
        return jdbc.query(sql, params, this::mapRow);
    }
}
