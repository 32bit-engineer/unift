package com.weekend.architect.unift.remote.core;

import com.weekend.architect.unift.remote.credentials.RemoteCredentials;
import com.weekend.architect.unift.remote.exception.ConnectionException;
import com.weekend.architect.unift.remote.model.RemoteSession;

/**
 * Central contract for a managed remote connection.
 *
 * <p>A {@code RemoteConnection} is both a {@link DirectoryBrowsable}
 * (browse / mutate the remote file-system) and a {@link FileTransferable}
 * (stream files in / out).  It is also {@link AutoCloseable} so that
 * try-with-resources and the {@code SessionReaper} can close it cleanly.
 *
 * <p>Concrete implementations are created by {@code ConnectionFactory}
 * and stored in the {@code SessionRegistry}.  All lifecycle management
 * (state machine, TTL renewal) is handled by {@link AbstractRemoteConnection}.
 *
 * <pre>
 * RemoteConnection (interface)
 *   └── AbstractRemoteConnection (abstract – lifecycle + template methods)
 *         └── SshRemoteConnection (JSch SSH/SFTP implementation)
 * </pre>
 */
public interface RemoteConnection extends DirectoryBrowsable, FileTransferable, AutoCloseable {

    /**
     * Establishes the physical connection to the remote host using the
     * supplied credentials.
     *
     * @param credentials typed credential object (sealed hierarchy)
     * @throws ConnectionException if the connection cannot be established
     */
    void connect(RemoteCredentials credentials) throws ConnectionException;

    /**
     * Gracefully closes the connection and releases all underlying resources.
     * Implementations must be idempotent.
     */
    @Override
    void close();

    /** Returns the session ID that uniquely identifies this connection. */
    String getSessionId();

    /** Returns the full session metadata. */
    RemoteSession getSession();

    /** Returns {@code true} only when the underlying transport is open. */
    boolean isConnected();

    /**
     * Detects and returns a human-readable name for the OS or service on the
     * remote end (e.g. {@code "Ubuntu 22.04.3 LTS"}, {@code "Amazon S3"}).
     *
     * <p>This is a best-effort operation called once after a successful connect.
     * Implementations may run a remote command, inspect a response header, or
     * return a static label.  Must never throw — return {@code null} on failure.
     *
     * <p>The default implementation returns {@code null}; protocol-specific
     * subclasses override this to provide real detection.
     */
    default String detectRemoteOs() {
        return null;
    }
}
