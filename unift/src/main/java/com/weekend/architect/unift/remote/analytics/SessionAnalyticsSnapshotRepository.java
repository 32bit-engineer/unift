package com.weekend.architect.unift.remote.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.weekend.architect.unift.remote.analytics.dto.SessionAnalyticsResponse;
import java.sql.ResultSet;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Persists and queries analytics snapshots in {@code session_analytics_snapshot}.
 *
 * <h6>Storage strategy</h6>
 * <p>Each probe result is stored in two ways:
 * <ul>
 *   <li><b>Scalar columns</b> — individual metric values for efficient SQL filtering
 *       and aggregation (e.g. "average CPU last week").</li>
 *   <li><b>{@code snapshot_json} (JSONB)</b> — full serialised
 *       {@link SessionAnalyticsResponse} for lossless replay including
 *       traffic history and connected-node list.</li>
 * </ul>
 *
 * <h6>Ownership</h6>
 * <p>Every query includes {@code user_id = :userId} so a user can never read
 * another user's analytics history, even if they know the session ID.
 */
@Slf4j
@Repository
@RequiredArgsConstructor
public class SessionAnalyticsSnapshotRepository {

    private static final int DEFAULT_LIMIT = 100;
    private static final int MAX_LIMIT = 500;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    /**
     * Persists one analytics snapshot.  Best-effort — callers should catch
     * and log any exception rather than propagating it.
     *
     * @param response  the fully-assembled analytics response to persist
     * @param userId    owner UUID (stored for ownership-scoped queries)
     */
    public void save(SessionAnalyticsResponse response, UUID userId) {
        String sql =
                """
                INSERT INTO session_analytics_snapshot (
                    session_id, user_id, host, state, captured_at,
                    session_duration_seconds,
                    latency_avg_ms, latency_min_ms, latency_max_ms,
                    packet_loss_percent, packets_sent, packets_received,
                    current_upload_bps, current_download_bps,
                    total_uploaded_bytes, total_downloaded_bytes,
                    cpu_percent, memory_used_percent, memory_used_bytes, memory_total_bytes,
                    disk_used_percent, disk_used_bytes, disk_total_bytes,
                    ssh_cipher, region, remote_pid,
                    snapshot_json
                ) VALUES (
                    :sessionId::uuid, :userId, :host, :state, NOW(),
                    :sessionDurationSeconds,
                    :latencyAvgMs, :latencyMinMs, :latencyMaxMs,
                    :packetLossPercent, :packetsSent, :packetsReceived,
                    :currentUploadBps, :currentDownloadBps,
                    :totalUploadedBytes, :totalDownloadedBytes,
                    :cpuPercent, :memoryUsedPercent, :memoryUsedBytes, :memoryTotalBytes,
                    :diskUsedPercent, :diskUsedBytes, :diskTotalBytes,
                    :sshCipher, :region, :remotePid,
                    :snapshotJson::jsonb
                )
                """;
        try {
            jdbc.update(sql, buildParams(response, userId));
            log.debug("[analytics-repo] Saved snapshot for session {}", response.getSessionId());
        } catch (Exception e) {
            log.warn(
                    "[analytics-repo] Failed to save snapshot for session {}: {}",
                    response.getSessionId(),
                    e.getMessage());
        }
    }

    /**
     * Returns historical snapshots for a session, newest-first.
     *
     * @param sessionId     the session to query
     * @param userId        requesting user — ownership gate at DB level
     * @param from          inclusive lower bound on {@code captured_at} (nullable)
     * @param to            inclusive upper bound on {@code captured_at} (nullable)
     * @param limit         max rows to return (capped at {@value #MAX_LIMIT})
     */
    public List<SessionAnalyticsResponse> findBySessionId(
            String sessionId, UUID userId, OffsetDateTime from, OffsetDateTime to, int limit) {

        int effectiveLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

        String sql =
                """
                SELECT snapshot_json
                FROM   session_analytics_snapshot
                WHERE  session_id = :sessionId::uuid
                  AND  user_id    = :userId
                ORDER BY captured_at DESC
                LIMIT  :limit
                """;

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("sessionId", sessionId)
                .addValue("userId", userId)
                .addValue("limit", effectiveLimit);

        return jdbc
                .query(sql, params, (ResultSet rs, int rowNum) -> {
                    String json = rs.getString("snapshot_json");
                    try {
                        return objectMapper.readValue(json, SessionAnalyticsResponse.class);
                    } catch (Exception e) {
                        log.warn("[analytics-repo] Failed to deserialise snapshot: {}", e.getMessage());
                        return null;
                    }
                })
                .stream()
                .filter(Objects::nonNull)
                .toList();
    }

    /**
     * Returns {@code true} when at least one more snapshot exists beyond the rows
     * already fetched — i.e., the caller should offer a "load more" option.
     *
     * <p><b>Why {@code EXISTS} instead of {@code COUNT(*) > N}:</b>
     * <ul>
     *   <li>PostgreSQL stops scanning as soon as it finds the first qualifying row
     *       at {@code OFFSET :offset}, making this O(1) extra work vs O(n) for
     *       a full {@code COUNT(*)}.</li>
     *   <li>{@code EXISTS} returns a native {@code boolean} column — no
     *       {@code bigint → int} implicit cast needed, and
     *       {@code queryForObject(..., Boolean.class)} maps it unambiguously.</li>
     * </ul>
     *
     * @param sessionId      session to check
     * @param userId         ownership filter — enforced in SQL
     * @param from           optional lower bound on {@code captured_at}
     * @param to             optional upper bound on {@code captured_at}
     * @param alreadyFetched number of rows the caller already holds (used as OFFSET)
     */
    public boolean hasMore(String sessionId, UUID userId, OffsetDateTime from, OffsetDateTime to, int alreadyFetched) {

        // OFFSET :offset skips past the already-fetched rows; LIMIT 1 stops at the
        // first additional row.  EXISTS short-circuits as soon as that row is found.
        String sql =
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM   session_analytics_snapshot
                    WHERE  session_id = :sessionId::uuid
                      AND  user_id    = :userId
                      AND  (:from::timestamptz IS NULL OR captured_at >= :from)
                      AND  (:to::timestamptz   IS NULL OR captured_at <= :to)
                    ORDER BY captured_at DESC
                    OFFSET :offset
                    LIMIT  1
                )
                """;

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("sessionId", sessionId)
                .addValue("userId", userId)
                .addValue("from", from)
                .addValue("to", to)
                .addValue("offset", alreadyFetched);

        Boolean result = jdbc.queryForObject(sql, params, Boolean.class);
        return Boolean.TRUE.equals(result);
    }

    private MapSqlParameterSource buildParams(SessionAnalyticsResponse r, UUID userId) {
        // Scalar extractions — null-safe throughout
        Double latencyAvg = r.getLatency() != null && !r.getLatency().isUnavailable()
                ? r.getLatency().getAvgMs()
                : null;
        Double latencyMin = r.getLatency() != null ? r.getLatency().getMinMs() : null;
        Double latencyMax = r.getLatency() != null ? r.getLatency().getMaxMs() : null;

        Double packetLoss = r.getPacketLoss() != null ? r.getPacketLoss().getLossPercent() : null;
        Integer pktSent = r.getPacketLoss() != null ? r.getPacketLoss().getPacketsSent() : null;
        Integer pktRcvd = r.getPacketLoss() != null ? r.getPacketLoss().getPacketsReceived() : null;

        Long uploadBps = r.getThroughput() != null ? r.getThroughput().getCurrentUploadBytesPerSec() : null;
        Long downloadBps = r.getThroughput() != null ? r.getThroughput().getCurrentDownloadBytesPerSec() : null;
        Long totalUp = r.getThroughput() != null ? r.getThroughput().getTotalUploadedBytes() : null;
        Long totalDown = r.getThroughput() != null ? r.getThroughput().getTotalDownloadedBytes() : null;

        Double cpu = r.getSystemMetrics() != null ? r.getSystemMetrics().getCpuPercent() : null;
        Double memPct = r.getSystemMetrics() != null ? r.getSystemMetrics().getMemoryUsedPercent() : null;
        Long memUsed = r.getSystemMetrics() != null ? r.getSystemMetrics().getMemoryUsedBytes() : null;
        Long memTotal = r.getSystemMetrics() != null ? r.getSystemMetrics().getMemoryTotalBytes() : null;
        Double diskPct = r.getSystemMetrics() != null ? r.getSystemMetrics().getDiskUsedPercent() : null;
        Long diskUsed = r.getSystemMetrics() != null ? r.getSystemMetrics().getDiskUsedBytes() : null;
        Long diskTotal = r.getSystemMetrics() != null ? r.getSystemMetrics().getDiskTotalBytes() : null;

        String cipher = r.getMetadata() != null ? r.getMetadata().getSshCipher() : null;
        String region = r.getMetadata() != null ? r.getMetadata().getRegion() : null;
        Long pid = r.getMetadata() != null ? r.getMetadata().getProcessPid() : null;

        String json;
        try {
            json = objectMapper.writeValueAsString(r);
        } catch (Exception e) {
            log.warn("[analytics-repo] JSON serialisation failed, storing empty object: {}", e.getMessage());
            json = "{}";
        }

        return new MapSqlParameterSource()
                .addValue("sessionId", r.getSessionId())
                .addValue("userId", userId)
                .addValue("host", r.getHost())
                .addValue("state", r.getState())
                .addValue("sessionDurationSeconds", r.getSessionDurationSeconds())
                .addValue("latencyAvgMs", latencyAvg)
                .addValue("latencyMinMs", latencyMin)
                .addValue("latencyMaxMs", latencyMax)
                .addValue("packetLossPercent", packetLoss)
                .addValue("packetsSent", pktSent)
                .addValue("packetsReceived", pktRcvd)
                .addValue("currentUploadBps", uploadBps)
                .addValue("currentDownloadBps", downloadBps)
                .addValue("totalUploadedBytes", totalUp)
                .addValue("totalDownloadedBytes", totalDown)
                .addValue("cpuPercent", cpu)
                .addValue("memoryUsedPercent", memPct)
                .addValue("memoryUsedBytes", memUsed)
                .addValue("memoryTotalBytes", memTotal)
                .addValue("diskUsedPercent", diskPct)
                .addValue("diskUsedBytes", diskUsed)
                .addValue("diskTotalBytes", diskTotal)
                .addValue("sshCipher", cipher)
                .addValue("region", region)
                .addValue("remotePid", pid)
                .addValue("snapshotJson", json);
    }
}
