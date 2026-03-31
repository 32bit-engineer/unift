package com.weekend.architect.unift.remote.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.weekend.architect.unift.remote.enums.UploadSessionStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.Builder;
import lombok.Value;

/** Snapshot of a resumable chunked-upload session. */
@Value
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class UploadSessionResponse {

    UUID id;
    String filename;
    long totalSize;
    int chunkSize;
    int totalChunks;

    /** Sorted list of 0-based chunk indices already acknowledged. */
    List<Integer> receivedChunks;

    String destinationPath;
    UploadSessionStatus status;

    /** Upload progress as an integer percentage (0–100). */
    int progressPercent;

    OffsetDateTime createdAt;
    OffsetDateTime expiresAt;
}
