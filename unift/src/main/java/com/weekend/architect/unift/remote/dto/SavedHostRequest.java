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
 * Request body for saving a new remote host configuration.
 *
 * <p>Credential fields ({@code password}, {@code privateKey}, {@code passphrase}) are
 * accepted as <em>plaintext</em> over TLS and encrypted with AES-256-GCM before being
 * written to the database. They are <strong>never</strong> returned in any response.
 *
 * <p>Cross-field validation (which credential fields are required for each
 * {@code authType}) is delegated to the per-protocol {@code CredentialValidator} strategy
 * in the service layer, keeping this DTO clean and protocol-agnostic.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class SavedHostRequest {

    /** Optional friendly name, e.g. "My VPS" or "Home Server". */
    private String label;

    /**
     * The remote protocol to use for this host.
     * Defaults to {@link ProtocolType#SSH_SFTP} for backwards compatibility.
     */
    @NotNull(message = "protocol is required")
    @Builder.Default
    private ProtocolType protocol = ProtocolType.SSH_SFTP;

    @NotBlank(message = "hostname is required")
    private String hostname;

    @Min(value = 1, message = "port must be ≥ 1")
    @Max(value = 65535, message = "port must be ≤ 65535")
    @Builder.Default
    private int port = 22;

    @NotBlank(message = "username is required")
    private String username;

    /**
     * SSH-specific authentication strategy.
     * Required when {@code protocol = SSH_SFTP}; ignored for other protocols.
     * Presence is validated by {@code SshCredentialValidator}.
     */
    private SshAuthType authType;

    /**
     * Plaintext password — encrypted with AES-256-GCM before storage.
     * Required when {@code authType = PASSWORD}.
     */
    private String password;

    /**
     * Plaintext PEM-encoded private key — encrypted with AES-256-GCM before storage.
     * Required when {@code authType} is {@code PRIVATE_KEY} or {@code PRIVATE_KEY_PASSPHRASE}.
     */
    private String privateKey;

    /**
     * Plaintext passphrase for the private key — encrypted with AES-256-GCM before storage.
     * Required when {@code authType = PRIVATE_KEY_PASSPHRASE}.
     */
    private String passphrase;

    /** When {@code true}, the SSH client verifies the server host key. Default: {@code false}. */
    @Builder.Default
    private boolean strictHostKeyChecking = false;

    /**
     * Expected server fingerprint, e.g. {@code SHA256:...}.
     * Required only when {@code strictHostKeyChecking = true} and no known_hosts file is configured.
     */
    private String expectedFingerprint;
}
