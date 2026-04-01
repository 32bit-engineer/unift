package com.weekend.architect.unift.remote.analytics.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** CPU, memory, and disk metrics collected from the remote host via SSH. */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SystemMetricsInfo {

    /**
     * CPU utilisation as a percentage (0–100), derived from {@code /proc/stat}. {@code null} when
     * not available (e.g. non-Linux host or probe failure).
     */
    Double cpuPercent;

    /** RAM utilisation as a percentage (0–100). {@code null} when not available. */
    Double memoryUsedPercent;

    /** Used memory in bytes. {@code null} when not available. */
    Long memoryUsedBytes;

    /** Total installed memory in bytes. {@code null} when not available. */
    Long memoryTotalBytes;

    /** Root filesystem utilisation as a percentage (0–100). {@code null} when not available. */
    Double diskUsedPercent;

    /** Used disk space on {@code /} in bytes. {@code null} when not available. */
    Long diskUsedBytes;

    /** Total disk capacity on {@code /} in bytes. {@code null} when not available. */
    Long diskTotalBytes;

    /** Whether the metrics collection probe failed entirely. */
    boolean unavailable;

    /** Factory: sentinel returned when the connection is not SSH-capable. */
    public static SystemMetricsInfo unavailable() {
        return SystemMetricsInfo.builder().unavailable(true).build();
    }
}
