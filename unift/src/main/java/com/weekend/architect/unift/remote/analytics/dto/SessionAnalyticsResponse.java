package com.weekend.architect.unift.remote.analytics.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
@AllArgsConstructor
@NoArgsConstructor
public class SessionAnalyticsResponse {

    private String sessionId;
    private String host;
    private String username;

    /** Current lifecycle state of the session (e.g. {@code "ACTIVE"}). */
    private String state;

    /** How long the session has been open, in seconds. */
    private long sessionDurationSeconds;

    /** Human-readable duration string, e.g. {@code "04:45:13"}. */
    private String sessionDurationFormatted;

    /** Bandwidth and transfer-volume metrics. */
    private ThroughputInfo throughput;

    /** SSH exec round-trip latency. */
    private LatencyInfo latency;

    /** ICMP packet-loss probe result. */
    private PacketLossInfo packetLoss;

    /**
     * Rolling 60-minute bandwidth samples (one per minute).
     * May be empty for brand-new sessions.
     */
    private List<TrafficDataPoint> trafficAnalysis;

    /** All active sessions belonging to the same owner. */
    private List<ConnectedNodeInfo> connectedNodes;

    /** SSH transport and session housekeeping metadata. */
    private SessionMetadataInfo metadata;

    /** Remote-host system resource utilisation. */
    private SystemMetricsInfo systemMetrics;

    /** Instant at which this snapshot was assembled. */
    private OffsetDateTime generatedAt;
}
