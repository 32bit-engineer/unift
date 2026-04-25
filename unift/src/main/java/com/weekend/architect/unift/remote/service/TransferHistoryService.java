package com.weekend.architect.unift.remote.service;

import com.weekend.architect.unift.remote.dto.TransferHistoryStatsResponse;
import com.weekend.architect.unift.remote.dto.TransferLogPageResponse;
import com.weekend.architect.unift.remote.dto.TransferLogResponse;
import java.util.UUID;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Service contract for querying the persistent transfer-history log.
 *
 * <p>Transfer log entries are written automatically by the remote-connection service when an upload
 * or download reaches a terminal state. This service provides read-only (plus delete) access to
 * that history for end-users.
 */
public interface TransferHistoryService {

    /**
     * Returns a paginated, filterable view of transfer log entries for the authenticated user.
     *
     * @param userId    authenticated user
     * @param page      0-based page index
     * @param size      page size (capped at 100 internally)
     * @param sessionId optional filter — only entries for this session ID
     * @param username  optional filter — substring match on SSH username
     * @param status    optional filter — exact status (COMPLETED, FAILED, CANCELLED)
     */
    TransferLogPageResponse listHistory(
            UUID userId, int page, int size, String sessionId, String username, String status);

    /**
     * Returns a single transfer log entry.
     *
     * @throws IllegalArgumentException if not found or not owned by the user
     */
    TransferLogResponse getEntry(UUID id, UUID userId);

    /** Returns aggregate statistics for the user's transfer history. */
    TransferHistoryStatsResponse getStats(UUID userId);

    /**
     * Deletes a transfer log entry.
     *
     * @throws IllegalArgumentException if not found or not owned by the user
     */
    void deleteEntry(UUID id, UUID userId);

    /**
     * Opens an SSE stream that pushes aggregate transfer statistics at the given interval.
     *
     * @param userId     authenticated user
     * @param intervalMs polling interval in milliseconds (clamped to allowed range internally)
     * @return a configured {@link SseEmitter} that the controller can return directly
     */
    SseEmitter streamStats(UUID userId, int intervalMs);
}
