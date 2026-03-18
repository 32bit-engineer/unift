package com.weekend.architect.unift.remote.credentials;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import lombok.Builder;
import lombok.Getter;

/** Placeholder – FTP support is not yet implemented. */
@Getter
public final class FtpCredentials extends RemoteCredentials {

    private final String username;
    private final String password;

    @Builder
    public FtpCredentials(
            String host,
            int port,
            String username,
            String password,
            boolean strictHostKeyChecking,
            String expectedFingerprint) {
        super(host, port, ProtocolType.FTP, strictHostKeyChecking, expectedFingerprint);
        this.username = username;
        this.password = password;
    }
}
