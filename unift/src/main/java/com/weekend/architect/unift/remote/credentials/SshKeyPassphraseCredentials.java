package com.weekend.architect.unift.remote.credentials;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import lombok.Builder;
import lombok.Getter;

/** SSH credentials authenticated via a passphrase-protected PEM private key. */
@Getter
public final class SshKeyPassphraseCredentials extends RemoteCredentials {

    private final String username;
    private final String privateKeyPem;
    private final String passphrase;

    @Builder
    public SshKeyPassphraseCredentials(
            String host, int port, String username, String privateKeyPem, String passphrase) {
        super(host, port, ProtocolType.SSH_SFTP);
        this.username = username;
        this.privateKeyPem = privateKeyPem;
        this.passphrase = passphrase;
    }
}
