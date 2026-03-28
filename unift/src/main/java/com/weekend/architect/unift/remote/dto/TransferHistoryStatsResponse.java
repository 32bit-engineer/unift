package com.weekend.architect.unift.remote.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Value;

/** Aggregate statistics derived from the authenticated user's transfer history. */
@Value
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class TransferHistoryStatsResponse {

    /** Total number of transfer log entries for this user. */
    long totalTransfers;

    long completedTransfers;
    long failedTransfers;
    long cancelledTransfers;

    /** Sum of {@code size_bytes} for all COMPLETED transfers. {@code null} if none. */
    Long totalBytesTransferred;

    /** Average {@code avg_speed_bps} across all COMPLETED transfers. {@code null} if none. */
    Long avgSpeedBps;
}
