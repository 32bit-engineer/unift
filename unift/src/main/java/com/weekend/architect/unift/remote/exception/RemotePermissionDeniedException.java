package com.weekend.architect.unift.remote.exception;

/**
 * Thrown when the authenticated SSH user lacks OS-level permission to perform an SFTP operation
 * on the remote server (SFTP status code 3 — {@code SSH_FX_PERMISSION_DENIED}).
 *
 * <p>This is <em>not</em> a gateway error — the remote server is healthy and reachable. The
 * denial is a real Unix filesystem permission check on the remote host. The API maps this to
 * {@code 403 Forbidden} so callers can distinguish it from connection failures (502).
 */
public class RemotePermissionDeniedException extends RemoteConnectionException {

    public RemotePermissionDeniedException(String path) {
        super("Permission denied on remote host: " + path);
    }
}
