package com.weekend.architect.unift.remote.analytics.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Aggregated throughput metrics for one session. */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ThroughputInfo {

    /** Instantaneous upload speed derived from active in-flight transfers (bytes/sec). */
    long currentUploadBytesPerSec;

    /** Instantaneous download speed derived from active in-flight transfers (bytes/sec). */
    long currentDownloadBytesPerSec;

    /** Total bytes uploaded since session opened. */
    long totalUploadedBytes;

    /** Total bytes downloaded since session opened. */
    long totalDownloadedBytes;

    /** Rolling 60-minute bandwidth history (one entry per minute). */
    List<TrafficDataPoint> history;

    /** Convenience: current combined throughput as Megabits/sec. */
    public double currentMbps() {
        return (currentUploadBytesPerSec + currentDownloadBytesPerSec) * 8.0 / 1_000_000.0;
    }
}
