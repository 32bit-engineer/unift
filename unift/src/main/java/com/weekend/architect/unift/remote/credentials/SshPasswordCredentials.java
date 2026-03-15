package com.weekend.architect.unift.remote.credentials;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import lombok.Builder;
import lombok.Getter;

/** SSH credentials authenticated via username + password. */
@Getter
public final class SshPasswordCredentials extends RemoteCredentials {

    private final String username;
    private final String password;

    @Builder
    public SshPasswordCredentials(String host, int port, String username, String password) {
        super(host, port, ProtocolType.SSH_SFTP);
        this.username = username;
        this.password = password;
    }
}
