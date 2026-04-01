package com.weekend.architect.unift.remote.analytics.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.weekend.architect.unift.remote.enums.SessionState;
import java.time.OffsetDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Summarises one peer SSH session for the "Connected Nodes" map panel. */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ConnectedNodeInfo {

    String sessionId;

    /** Friendly label supplied at connect-time, or host if none given. */
    String label;

    String host;
    String username;
    int port;

    SessionState state;

    /** Wall-clock instant when this session was opened. */
    OffsetDateTime createdAt;

    /**
     * Detected OS/service name (e.g. "Ubuntu 22.04.3 LTS"). {@code null} if detection has not
     * completed.
     */
    String remoteOs;

    /**
     * Instantaneous CPU utilisation on the remote host as a percentage (0–100). {@code null} if the
     * SSH probe failed or the session is not an SSH connection.
     */
    Double cpuPercent;
}
