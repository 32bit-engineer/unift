package com.weekend.architect.unift.remote.service;

import com.weekend.architect.unift.remote.dto.UploadSessionRequest;
import com.weekend.architect.unift.remote.dto.UploadSessionResponse;
import com.weekend.architect.unift.remote.enums.UploadSessionStatus;
import java.util.List;
import java.util.UUID;

/**
 * Service contract for managing resumable chunked-upload sessions.
 *
 * <p>An upload session tracks which chunks of a large file have been acknowledged.
 * The caller is responsible for splitting the file and sending chunks through a
 * separate channel (e.g. the SFTP upload endpoints); this service tracks the
 * metadata and completion state.
 */
public interface UploadSessionService {

    /**
     * Creates a new upload session for the given user.
     *
     * @param userId  authenticated user
     * @param request session parameters (filename, size, chunk layout, destination)
     * @return the created session snapshot, status = PENDING
     */
    UploadSessionResponse createSession(UUID userId, UploadSessionRequest request);

    /**
     * Returns all upload sessions for a user.
     *
     * @param userId authenticated user
     * @param status optional status filter; {@code null} returns all statuses
     * @return list ordered newest-first
     */
    List<UploadSessionResponse> listSessions(UUID userId, UploadSessionStatus status);

    /**
     * Returns a single upload session.
     *
     * @throws com.weekend.architect.unift.remote.exception.UploadSessionNotFoundException if not found / not owned
     */
    UploadSessionResponse getSession(UUID sessionId, UUID userId);

    /**
     * Acknowledges that chunk {@code chunkIndex} (0-based) has been sent.
     *
     * <p>When the last outstanding chunk is acknowledged the session status
     * automatically transitions to {@code COMPLETED}.
     *
     * @throws com.weekend.architect.unift.remote.exception.UploadSessionNotFoundException if not found / not owned
     * @throws IllegalArgumentException if the chunk index is out of range
     * @throws IllegalStateException    if the session is not PENDING or IN_PROGRESS
     */
    UploadSessionResponse acknowledgeChunk(UUID sessionId, UUID userId, int chunkIndex);

    /**
     * Aborts an active upload session, marking it as FAILED and removing the row.
     *
     * @throws com.weekend.architect.unift.remote.exception.UploadSessionNotFoundException if not found / not owned
     */
    void abortSession(UUID sessionId, UUID userId);
}
