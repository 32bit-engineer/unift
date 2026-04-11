package com.weekend.architect.unift.remote.model;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Persistent audit record for a completed (or failed / cancelled) file transfer.
 *
 * <p>Maps 1-to-1 to the {@code transfer_log} table. Rows are written automatically by {@code
 * RemoteConnectionServiceImpl} when a download or upload reaches a terminal state (COMPLETED,
 * FAILED, CANCELLED). The table is also queryable through the {@code TransferHistoryController}
 * REST API so users can review their full transfer history.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TransferLog {

    private UUID id;

    /**
     * The UniFT user who performed the transfer. May be {@code null} for system-initiated
     * transfers.
     */
    private UUID userId;

    /** The session ID this transfer belonged to (may be null for legacy rows). */
    private String sessionId;

    /** The SSH username used for the session (may be null for legacy rows). */
    private String username;

    /** Basename of the file (extracted from source or destination path). */
    private String filename;

    /**
     * Human-readable source descriptor, e.g. {@code "client"} for uploads or {@code
     * "ssh://host:22/path"} for downloads.
     */
    private String source;

    /** Human-readable destination descriptor (mirror of source). */
    private String destination;

    /** Number of bytes actually transferred. {@code null} if unknown. */
    private Long sizeBytes;

    /** Average throughput in bytes-per-second. {@code null} if duration was zero or unknown. */
    private Long avgSpeedBps;

    /** Wall-clock duration of the transfer in milliseconds. {@code null} if not recorded. */
    private Long durationMs;

    /**
     * Terminal state of the transfer. Values mirror {@link
     * com.weekend.architect.unift.remote.enums.TransferState}: {@code COMPLETED}, {@code FAILED},
     * {@code CANCELLED}.
     */
    private String status;

    /** Error detail when {@code status = FAILED}. {@code null} otherwise. */
    private String errorMessage;

    private OffsetDateTime createdAt;
}
