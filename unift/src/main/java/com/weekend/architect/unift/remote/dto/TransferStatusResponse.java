package com.weekend.architect.unift.remote.dto;

import com.weekend.architect.unift.remote.enums.TransferDirection;
import com.weekend.architect.unift.remote.enums.TransferState;
import java.time.OffsetDateTime;
import lombok.Builder;
import lombok.Value;

/** Snapshot of a single file-transfer operation's progress. */
@Value
@Builder
public class TransferStatusResponse {

    String transferId;
    String sessionId;
    TransferDirection direction;
    TransferState state;
    String remotePath;

    /** Total file size in bytes; {@code -1} if unknown. */
    long totalBytes;

    /** Bytes transferred so far. */
    long bytesTransferred;

    /** 0–100; {@code -1} if total size is unknown. */
    int progressPercent;

    OffsetDateTime startedAt;

    /** {@code null} while the transfer is in progress. */
    OffsetDateTime completedAt;

    /** Populated only when {@code state = FAILED}. */
    String errorMessage;
}
