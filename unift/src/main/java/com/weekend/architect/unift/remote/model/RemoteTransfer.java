package com.weekend.architect.unift.remote.model;

import com.weekend.architect.unift.remote.core.CancellationToken;
import com.weekend.architect.unift.remote.enums.TransferDirection;
import com.weekend.architect.unift.remote.enums.TransferState;
import java.time.OffsetDateTime;
import java.util.concurrent.atomic.AtomicLong;
import lombok.Builder;
import lombok.Data;
import lombok.Getter;

/**
 * Tracks the progress of a single file-transfer operation.
 *
 * <p>{@code bytesTransferred} is an {@link AtomicLong} so that the
 * JSch progress-monitor callback (running on the transfer thread) can
 * safely update it while the API response thread reads the latest value.
 */
@Data
@Builder
public class RemoteTransfer {

    private final String transferId;
    private final String sessionId;
    private final TransferDirection direction;
    private final String remotePath;

    /** Total size in bytes; {@code -1} if unknown (e.g. streaming with no Content-Length). */
    private final long totalBytes;

    private final OffsetDateTime startedAt;

    // --- mutable fields ---

    private volatile TransferState state;
    private volatile OffsetDateTime completedAt;
    private volatile String errorMessage;

    /**
     * Cancellation token for stream uploads; {@code null} for non-cancellable transfers
     * (e.g. multipart uploads).  Set by {@code uploadStream} immediately after the transfer
     * is created so the cancel endpoint can signal it.
     */
    private volatile CancellationToken cancellationToken;

    /** Bytes transferred so far; updated atomically by the progress callback. */
    @Builder.Default
    @Getter
    private final AtomicLong bytesTransferred = new AtomicLong(0L);

    /**
     * Returns transfer progress as an integer percentage (0–100).
     * Returns {@code -1} if total size is unknown.
     */
    public int progressPercent() {
        if (totalBytes <= 0) {
            return -1;
        }
        long transferred = bytesTransferred.get();
        return (int) Math.min(100L, (transferred * 100L) / totalBytes);
    }
}
