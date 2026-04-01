package com.weekend.architect.unift.remote.analytics.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A single bandwidth sample captured at one-minute intervals. Stored in the rolling 60-entry
 * history kept by {@code SessionMetricsStore}.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class TrafficDataPoint {

    /** Wall-clock instant when this sample was taken. */
    Instant timestamp;

    /** Upload throughput during the sample window (bytes/sec). */
    long uploadBytesPerSec;

    /** Download throughput during the sample window (bytes/sec). */
    long downloadBytesPerSec;

    /** Combined upload + download throughput (bytes/sec). */
    public long totalBytesPerSec() {
        return uploadBytesPerSec + downloadBytesPerSec;
    }

    /** Combined throughput in Megabits/sec (convenient for charting). */
    public double totalMbps() {
        return (uploadBytesPerSec + downloadBytesPerSec) * 8.0 / 1_000_000.0;
    }
}
