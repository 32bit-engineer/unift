package com.weekend.architect.unift.remote.credentials;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * Sealed base class for all remote-connection credential types.
 *
 * <p>The sealed hierarchy enables exhaustive {@code switch} expressions (Java 17+) in the {@code
 * ConnectionFactory}, eliminating the need for {@code instanceof} chains and ensuring compile-time
 * coverage of every protocol variant.
 *
 * <pre>
 * RemoteCredentials (sealed)
 *   ├── SshPasswordCredentials
 *   ├── SshKeyCredentials
 *   ├── SshKeyPassphraseCredentials
 *   ├── FtpCredentials          (stub – future)
 *   ├── S3Credentials           (stub – future)
 *   ├── AzureBlobCredentials    (stub – future)
 *   └── GcsCredentials          (stub – future)
 * </pre>
 */
@Getter
@RequiredArgsConstructor
public abstract sealed class RemoteCredentials
        permits SshPasswordCredentials,
                SshKeyCredentials,
                SshKeyPassphraseCredentials,
                FtpCredentials,
                S3Credentials,
                AzureBlobCredentials,
                GcsCredentials {

    private final String host;
    private final int port;
    private final ProtocolType protocol;
    private final boolean strictHostKeyChecking;
    private final String expectedFingerprint;
}
