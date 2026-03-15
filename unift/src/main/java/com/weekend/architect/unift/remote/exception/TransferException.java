package com.weekend.architect.unift.remote.exception;

/** Thrown when a file upload or download operation fails mid-stream. */
public class TransferException extends RemoteConnectionException {

    public TransferException(String message) {
        super(message);
    }

    public TransferException(String message, Throwable cause) {
        super(message, cause);
    }
}
