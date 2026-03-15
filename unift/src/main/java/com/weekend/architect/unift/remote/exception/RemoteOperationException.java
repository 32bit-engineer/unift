package com.weekend.architect.unift.remote.exception;

/** Thrown when a remote file/directory operation (list, delete, rename, mkdir) fails. */
public class RemoteOperationException extends RemoteConnectionException {

    public RemoteOperationException(String message) {
        super(message);
    }

    public RemoteOperationException(String message, Throwable cause) {
        super(message, cause);
    }
}
