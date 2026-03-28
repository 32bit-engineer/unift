package com.weekend.architect.unift.remote.analytics.dto;

import java.time.Instant;
import lombok.Builder;
import lombok.Value;

/**
 * A single bandwidth sample captured at one-minute intervals.
 * Stored in the rolling 60-entry history kept by {@code SessionMetricsStore}.
 */
@Value
@Builder
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
