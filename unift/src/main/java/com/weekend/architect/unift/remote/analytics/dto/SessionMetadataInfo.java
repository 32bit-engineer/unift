package com.weekend.architect.unift.remote.analytics.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** SSH session-level metadata shown in the "Session Metadata" panel. */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SessionMetadataInfo {

    /**
     * PID of the remote sshd child process serving this session (obtained via {@code echo $PPID}).
     * {@code null} when not obtainable.
     */
    Long processPid;

    /** SSH port number. */
    int port;

    /**
     * First configured SSH cipher preference for this session (e.g. {@code
     * "chacha20-poly1305@openssh.com"}). Approximates the negotiated cipher; exact negotiation is
     * opaque in JSch.
     */
    String sshCipher;

    /**
     * Application-level encryption scheme used to protect stored credentials at rest (always {@code
     * "AES-256-GCM"} in UniFT).
     */
    String encryption;

    /**
     * Tunnel topology descriptor. {@code "Direct P2P"} for a direct SSH connection with no jump
     * host.
     */
    String tunnelMode;

    /**
     * Instant of the last successfully completed API activity on this session (acts as a heartbeat
     * indicator).
     */
    Instant lastHeartbeat;

    /**
     * Human-readable region / location string derived from the remote host's DNS name or IP
     * geolocation (e.g. {@code "US-WEST-2"}). {@code null} if detection failed.
     */
    String region;

    /** Detected OS / service name of the remote host. */
    String remoteOs;
}
