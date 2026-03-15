package com.weekend.architect.unift.remote.exception;

/** Thrown when establishing the physical connection to the remote host fails. */
public class ConnectionException extends RemoteConnectionException {

    public ConnectionException(String message) {
        super(message);
    }

    public ConnectionException(String message, Throwable cause) {
        super(message, cause);
    }
}
