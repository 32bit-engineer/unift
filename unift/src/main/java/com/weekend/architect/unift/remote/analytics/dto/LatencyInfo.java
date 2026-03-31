package com.weekend.architect.unift.remote.analytics.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Round-trip latency measurements obtained via SSH exec probes. */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class LatencyInfo {

    /** Average RTT across all probes (ms); {@code -1} if unavailable. */
    double avgMs;

    /** Minimum RTT observed (ms); {@code null} if unavailable. */
    Double minMs;

    /** Maximum RTT observed (ms); {@code null} if unavailable. */
    Double maxMs;

    /** Number of successful probe responses. */
    int samplesCount;

    /** {@code true} if measurement failed (SSH not responding). */
    boolean unavailable;

    /** Returns a sentinel instance when measurement is not possible. */
    public static LatencyInfo unavailable() {
        return LatencyInfo.builder().avgMs(-1).samplesCount(0).unavailable(true).build();
    }
}
