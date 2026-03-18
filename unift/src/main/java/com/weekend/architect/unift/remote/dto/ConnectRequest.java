package com.weekend.architect.unift.remote.dto;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import com.weekend.architect.unift.remote.enums.SshAuthType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request body for {@code POST /api/remote/sessions}.
 *
 * <p>Cross-field validation (password/key required depending on authType)
 * is enforced in the service layer, not here, to keep the DTO clean.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ConnectRequest {

    @NotNull(message = "protocol is required")
    private ProtocolType protocol;

    /**
     * Optional: Friendly alias for this connection (e.g. "Production Server", "Staging").
     * Returned back in the ConnectResponse.
     */
    private String label;

    @NotBlank(message = "host is required")
    private String host;

    @Min(value = 1, message = "port must be ≥ 1")
    @Max(value = 65535, message = "port must be ≤ 65535")
    private int port;

    /** Required for SSH protocols. */
    @NotBlank(message = "username is required")
    private String username;

    /** Required when {@code protocol = SSH_SFTP}. */
    private SshAuthType sshAuthType;

    /** Required when {@code sshAuthType = PASSWORD}. */
    private String password;

    /** PEM-encoded private key. Required when {@code sshAuthType} is {@code PRIVATE_KEY} or {@code PRIVATE_KEY_PASSPHRASE}. */
    private String privateKey;

    /** Required when {@code sshAuthType = PRIVATE_KEY_PASSPHRASE}. */
    private String passphrase;

    /**
     * Desired session TTL in minutes.  {@code 0} means "use server default".
     * Capped by {@code unift.remote.session-ttl-minutes}.
     */
    @Min(value = 0, message = "sessionTtlMinutes must be ≥ 0")
    @Builder.Default
    private long sessionTtlMinutes = 0;

    /**
     * If true, the SSH client will verify the server's host key against known_hosts.
     * If false (default), it will skip verification (StrictHostKeyChecking=no).
     */
    @Builder.Default
    private boolean strictHostKeyChecking = false;

    /**
     * Optional: The expected SSH host key fingerprint (e.g. "SHA256:...", "MD5:...").
     * Required if strictHostKeyChecking is true and no known_hosts file is configured.
     */
    private String expectedFingerprint;
}
