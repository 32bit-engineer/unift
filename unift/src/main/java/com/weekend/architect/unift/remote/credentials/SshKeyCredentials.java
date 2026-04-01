package com.weekend.architect.unift.remote.credentials;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import lombok.Builder;
import lombok.Getter;

/** SSH credentials authenticated via a PEM-encoded private key (no passphrase). */
@Getter
public final class SshKeyCredentials extends RemoteCredentials {

    private final String username;

    /** PEM-encoded private key content (e.g. {@code -----BEGIN RSA PRIVATE KEY-----\n...}). */
    private final String privateKeyPem;

    @Builder
    public SshKeyCredentials(
            String host,
            int port,
            String username,
            String privateKeyPem,
            boolean strictHostKeyChecking,
            String expectedFingerprint) {
        super(host, port, ProtocolType.SSH_SFTP, strictHostKeyChecking, expectedFingerprint);
        this.username = username;
        this.privateKeyPem = privateKeyPem;
    }
}
