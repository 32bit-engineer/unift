package com.weekend.architect.unift.remote.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Externalized configuration for the remote-connection feature.
 * All properties live under the {@code unift.remote.*} prefix in
 * {@code application.yaml}.
 */
@Data
@Component
@ConfigurationProperties(prefix = "unift.remote")
public class RemoteConnectionProperties {

    /** Default session TTL in minutes. Default: 30 min. */
    private long sessionTtlMinutes = 30;

    /** Maximum concurrent active sessions per authenticated user. Default: 5. */
    private int maxSessionsPerUser = 5;

    /** How often the {@code SessionReaper} runs (milliseconds). Default: 60 s. */
    private long reaperIntervalMs = 60_000L;

    /** TCP connect timeout for SSH (milliseconds). Default: 15 s. */
    private int connectTimeoutMs = 15_000;

    /** SFTP channel open timeout (milliseconds). Default: 10 s. */
    private int channelTimeoutMs = 10_000;

    /**
     * How often JSch sends SSH-level keep-alive packets to the remote host (milliseconds).
     * Set lower than the shortest expected firewall/NAT idle-connection timeout (commonly 30–60 s).
     * Default: 30 s.
     */
    private int sshKeepAliveIntervalMs = 30_000;

    /**
     * Number of unanswered SSH keep-alive packets before JSch treats the connection as dead
     * and closes it.  Default: 3.
     */
    private int sshKeepAliveCountMax = 3;

    /**
     * When {@code true} the session TTL is reset (slid forward) on each
     * API activity.  When {@code false} the session expires exactly
     * {@code sessionTtlMinutes} after it was created.
     */
    private boolean slidingTtl = true;
}
