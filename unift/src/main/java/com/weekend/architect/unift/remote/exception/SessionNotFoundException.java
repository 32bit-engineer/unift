package com.weekend.architect.unift.remote.exception;

/** Thrown when a session ID cannot be found in the {@code SessionRegistry}. */
public class SessionNotFoundException extends RemoteConnectionException {

    public SessionNotFoundException(String sessionId) {
        super("Remote session not found: " + sessionId);
    }
}
