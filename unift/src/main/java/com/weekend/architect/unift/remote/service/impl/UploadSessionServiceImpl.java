package com.weekend.architect.unift.remote.service.impl;

import com.weekend.architect.unift.remote.dto.UploadSessionRequest;
import com.weekend.architect.unift.remote.dto.UploadSessionResponse;
import com.weekend.architect.unift.remote.enums.UploadSessionStatus;
import com.weekend.architect.unift.remote.exception.UploadSessionNotFoundException;
import com.weekend.architect.unift.remote.model.UploadSession;
import com.weekend.architect.unift.remote.repository.UploadSessionRepository;
import com.weekend.architect.unift.remote.service.UploadSessionService;
import com.weekend.architect.unift.utils.UuidUtils;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class UploadSessionServiceImpl implements UploadSessionService {

    private final UploadSessionRepository repository;

    @Override
    public UploadSessionResponse createSession(UUID userId, UploadSessionRequest request) {
        UploadSession session = UploadSession.builder()
                .id(UuidUtils.uuidVersion7())
                .userId(userId)
                .filename(request.getFilename())
                .totalSize(request.getTotalSize())
                .chunkSize(request.getChunkSize())
                .totalChunks(request.getTotalChunks())
                .receivedChunks(List.of())
                .destinationPath(request.getDestinationPath())
                .status(UploadSessionStatus.PENDING)
                .build();

        repository.save(session);
        log.info(
                "[upload-session] Created session {} for user {} → {} ({} chunks)",
                session.getId(),
                userId,
                request.getFilename(),
                request.getTotalChunks());

        // Re-fetch to get DB-generated created_at / expires_at
        return toResponse(repository
                .findById(session.getId(), userId)
                .orElseThrow(() -> new UploadSessionNotFoundException(session.getId())));
    }

    @Override
    public List<UploadSessionResponse> listSessions(UUID userId, UploadSessionStatus status) {
        return repository.findByUserId(userId, status).stream()
                .map(this::applyExpiryAndMap)
                .toList();
    }

    @Override
    public UploadSessionResponse getSession(UUID sessionId, UUID userId) {
        UploadSession session = requireSession(sessionId, userId);
        return applyExpiryAndMap(session);
    }

    @Override
    public UploadSessionResponse acknowledgeChunk(UUID sessionId, UUID userId, int chunkIndex) {
        UploadSession session = requireSession(sessionId, userId);

        // Guard: chunk index range
        if (chunkIndex < 0 || chunkIndex >= session.getTotalChunks()) {
            throw new IllegalArgumentException(
                    "Chunk index " + chunkIndex + " is out of range [0, " + (session.getTotalChunks() - 1) + "]");
        }

        // Guard: session must be active (expired sessions fail the DB predicate too,
        // but give a clear message here)
        if (session.getStatus() == UploadSessionStatus.COMPLETED) {
            throw new IllegalStateException("Upload session " + sessionId + " is already COMPLETED");
        }
        if (session.getStatus() == UploadSessionStatus.FAILED || session.getStatus() == UploadSessionStatus.EXPIRED) {
            throw new IllegalStateException(
                    "Upload session " + sessionId + " is " + session.getStatus() + " and cannot accept new chunks");
        }

        boolean updated = repository.acknowledgeChunk(sessionId, userId, chunkIndex);
        if (!updated) {
            // Either already received, or session expired between our read and the update
            log.debug(
                    "[upload-session] Chunk {} already acknowledged for session {} (or session" + " expired)",
                    chunkIndex,
                    sessionId);
        }

        // Return the refreshed state
        UploadSession refreshed = requireSession(sessionId, userId);
        log.info(
                "[upload-session] Chunk {} acknowledged for session {} → status={}",
                chunkIndex,
                sessionId,
                refreshed.getStatus());
        return applyExpiryAndMap(refreshed);
    }

    @Override
    public void abortSession(UUID sessionId, UUID userId) {
        requireSession(sessionId, userId); // ownership / existence check
        boolean deleted = repository.deleteById(sessionId, userId);
        if (!deleted) {
            throw new UploadSessionNotFoundException(sessionId);
        }
        log.info("[upload-session] Session {} aborted by user {}", sessionId, userId);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private UploadSession requireSession(UUID sessionId, UUID userId) {
        return repository.findById(sessionId, userId).orElseThrow(() -> new UploadSessionNotFoundException(sessionId));
    }

    /**
     * Checks whether the session has passed its TTL and, if so, updates the DB status to EXPIRED
     * before converting to a response DTO.
     */
    private UploadSessionResponse applyExpiryAndMap(UploadSession session) {
        if ((session.getStatus() == UploadSessionStatus.PENDING
                        || session.getStatus() == UploadSessionStatus.IN_PROGRESS)
                && session.getExpiresAt() != null
                && OffsetDateTime.now().isAfter(session.getExpiresAt())) {
            repository.updateStatus(session.getId(), session.getUserId(), UploadSessionStatus.EXPIRED);
            session.setStatus(UploadSessionStatus.EXPIRED);
            log.debug("[upload-session] Session {} marked EXPIRED", session.getId());
        }
        return toResponse(session);
    }

    private static UploadSessionResponse toResponse(UploadSession s) {
        int received = s.getReceivedChunks() != null ? s.getReceivedChunks().size() : 0;
        int percent = s.getTotalChunks() > 0 ? (received * 100) / s.getTotalChunks() : 0;
        return UploadSessionResponse.builder()
                .id(s.getId())
                .filename(s.getFilename())
                .totalSize(s.getTotalSize())
                .chunkSize(s.getChunkSize())
                .totalChunks(s.getTotalChunks())
                .receivedChunks(s.getReceivedChunks())
                .destinationPath(s.getDestinationPath())
                .status(s.getStatus())
                .progressPercent(percent)
                .createdAt(s.getCreatedAt())
                .expiresAt(s.getExpiresAt())
                .build();
    }
}
