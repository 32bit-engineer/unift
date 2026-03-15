package com.weekend.architect.unift.remote.exception;

/** Thrown when a remote directory-browsing or file-metadata operation fails. */
public class BrowseException extends RemoteConnectionException {

    public BrowseException(String message) {
        super(message);
    }

    public BrowseException(String message, Throwable cause) {
        super(message, cause);
    }
}
