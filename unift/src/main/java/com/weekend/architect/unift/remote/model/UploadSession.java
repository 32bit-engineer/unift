package com.weekend.architect.unift.remote.model;

import com.weekend.architect.unift.remote.enums.UploadSessionStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Persistent state for a resumable chunked-upload session.
 *
 * <p>Maps 1-to-1 to the {@code upload_sessions} table. The
 * {@code receivedChunks} field is backed by a PostgreSQL {@code INT[]} column
 * and tracks the (0-based) indices of every chunk that has been acknowledged.
 * When {@code receivedChunks.size() == totalChunks} the session transitions
 * to {@link UploadSessionStatus#COMPLETED} atomically in the DB.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UploadSession {

    private UUID id;
    private UUID userId;

    /** Original filename of the file being uploaded. */
    private String filename;

    /** Total size of the file in bytes. */
    private long totalSize;

    /** Size of each chunk in bytes (last chunk may be smaller). */
    private int chunkSize;

    /** Total number of chunks the file was split into. */
    private int totalChunks;

    /**
     * Sorted list of 0-based chunk indices that have been acknowledged.
     * Stored as {@code INT[]} in PostgreSQL.
     */
    private List<Integer> receivedChunks;

    /** Absolute path on the remote host where the assembled file should be written. */
    private String destinationPath;

    private UploadSessionStatus status;

    private OffsetDateTime createdAt;

    /** After this instant the session is considered expired and cannot accept new chunks. */
    private OffsetDateTime expiresAt;
}
