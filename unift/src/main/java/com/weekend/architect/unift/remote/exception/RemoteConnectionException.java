package com.weekend.architect.unift.remote.exception;

/**
 * Root unchecked exception for all remote-connection failures. All sub-exceptions in this package
 * extend this class so that a single {@code @ExceptionHandler} can act as a fallback.
 */
public class RemoteConnectionException extends RuntimeException {

    public RemoteConnectionException(String message) {
        super(message);
    }

    public RemoteConnectionException(String message, Throwable cause) {
        super(message, cause);
    }
}
