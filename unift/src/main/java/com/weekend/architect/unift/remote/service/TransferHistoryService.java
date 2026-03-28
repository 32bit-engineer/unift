package com.weekend.architect.unift.remote.service;

import com.weekend.architect.unift.remote.dto.TransferHistoryStatsResponse;
import com.weekend.architect.unift.remote.dto.TransferLogResponse;
import java.util.List;
import java.util.UUID;

/**
 * Service contract for querying the persistent transfer-history log.
 *
 * <p>Transfer log entries are written automatically by the remote-connection
 * service when an upload or download reaches a terminal state.  This service
 * provides read-only (plus delete) access to that history for end-users.
 */
public interface TransferHistoryService {

    /**
     * Returns a paginated list of transfer log entries for the authenticated user.
     *
     * @param userId authenticated user
     * @param page   0-based page index
     * @param size   page size (capped at 100 internally)
     * @return list ordered newest-first
     */
    List<TransferLogResponse> listHistory(UUID userId, int page, int size);

    /**
     * Returns a single transfer log entry.
     *
     * @throws IllegalArgumentException if not found or not owned by the user
     */
    TransferLogResponse getEntry(UUID id, UUID userId);

    /**
     * Returns aggregate statistics for the user's transfer history.
     */
    TransferHistoryStatsResponse getStats(UUID userId);

    /**
     * Deletes a transfer log entry.
     *
     * @throws IllegalArgumentException if not found or not owned by the user
     */
    void deleteEntry(UUID id, UUID userId);
}
