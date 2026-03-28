package com.weekend.architect.unift.remote.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Builder;
import lombok.Value;

/** Persistent audit record for a completed, failed, or cancelled file transfer. */
@Value
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class TransferLogResponse {

    UUID id;
    String filename;
    String source;
    String destination;

    /** Bytes actually transferred. {@code null} if not recorded. */
    Long sizeBytes;

    /** Average throughput in bytes-per-second. {@code null} if not recorded. */
    Long avgSpeedBps;

    /** Wall-clock transfer duration in milliseconds. {@code null} if not recorded. */
    Long durationMs;

    /** Terminal state: {@code COMPLETED}, {@code FAILED}, or {@code CANCELLED}. */
    String status;

    /** Error detail when {@code status = FAILED}. */
    String errorMessage;

    OffsetDateTime createdAt;
}
