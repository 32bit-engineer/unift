package com.weekend.architect.unift.remote.analytics.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.Builder;
import lombok.Value;

/**
 * Top-level analytics snapshot for one active remote session.
 *
 * <p>Returned by {@code GET /api/remote/sessions/{sessionId}/analytics}.
 * All expensive sub-probes (latency, packet-loss, system metrics) run in
 * parallel on virtual threads and are assembled here.
 */
@Value
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SessionAnalyticsResponse {

    String sessionId;
    String host;
    String username;

    /** Current lifecycle state of the session (e.g. {@code "ACTIVE"}). */
    String state;

    /** How long the session has been open, in seconds. */
    long sessionDurationSeconds;

    /** Human-readable duration string, e.g. {@code "04:45:13"}. */
    String sessionDurationFormatted;

    /** Bandwidth and transfer-volume metrics. */
    ThroughputInfo throughput;

    /** SSH exec round-trip latency. */
    LatencyInfo latency;

    /** ICMP packet-loss probe result. */
    PacketLossInfo packetLoss;

    /**
     * Rolling 60-minute bandwidth samples (one per minute).
     * May be empty for brand-new sessions.
     */
    List<TrafficDataPoint> trafficAnalysis;

    /** All active sessions belonging to the same owner. */
    List<ConnectedNodeInfo> connectedNodes;

    /** SSH transport and session housekeeping metadata. */
    SessionMetadataInfo metadata;

    /** Remote-host system resource utilisation. */
    SystemMetricsInfo systemMetrics;

    /** Instant at which this snapshot was assembled. */
    OffsetDateTime generatedAt;
}
