package com.weekend.architect.unift.remote.factory;

import com.weekend.architect.unift.remote.config.RemoteConnectionProperties;
import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.credentials.RemoteCredentials;
import com.weekend.architect.unift.remote.model.RemoteSession;
import com.weekend.architect.unift.remote.ssh.SshRemoteConnection;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Factory that creates the correct {@link RemoteConnection} implementation
 * for a given {@link RemoteCredentials} object.
 *
 * <p>Dispatches on {@code credentials.getProtocol()} using a sealed-class
 * switch expression.  Adding a new protocol requires only:
 * <ol>
 *   <li>Adding the new credential subclass to the sealed hierarchy.</li>
 *   <li>Adding a new branch in the switch below.</li>
 *   <li>Implementing {@link com.weekend.architect.unift.remote.core.AbstractRemoteConnection}
 *       for the new protocol.</li>
 * </ol>
 *
 * <p>The factory does <strong>not</strong> call {@link RemoteConnection#connect};
 * that is the service layer's responsibility so that it can handle errors
 * and roll back the session registration.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ConnectionFactory {

    private final RemoteConnectionProperties props;

    /**
     * Instantiates the protocol-specific connection implementation.
     *
     * @param credentials typed credentials (protocol is derived from subclass type)
     * @param session     pre-built session envelope
     * @return a disconnected {@link RemoteConnection} ready to be connected
     * @throws UnsupportedOperationException if the protocol is not yet implemented
     */
    public RemoteConnection create(RemoteCredentials credentials, RemoteSession session) {
        log.debug(
                "Creating connection for protocol {} / session {}", credentials.getProtocol(), session.getSessionId());

        return switch (credentials.getProtocol()) {
            case SSH_SFTP -> new SshRemoteConnection(session, props);
            case FTP -> throw new UnsupportedOperationException("FTP support is not yet implemented");
            case S3 -> throw new UnsupportedOperationException("S3 support is not yet implemented");
            case AZURE_BLOB -> throw new UnsupportedOperationException("Azure Blob support is not yet implemented");
            case GCS -> throw new UnsupportedOperationException("GCS support is not yet implemented");
        };
    }
}
