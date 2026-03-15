package com.weekend.architect.unift.remote.exception;

/** Thrown when the supplied credentials fail validation before a connection attempt. */
public class CredentialValidationException extends RemoteConnectionException {

    public CredentialValidationException(String message) {
        super(message);
    }
}
