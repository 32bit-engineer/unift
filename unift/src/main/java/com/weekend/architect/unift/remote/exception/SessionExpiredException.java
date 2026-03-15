package com.weekend.architect.unift.remote.exception;

/** Thrown when a session exists but its TTL has elapsed. */
public class SessionExpiredException extends RemoteConnectionException {

    public SessionExpiredException(String sessionId) {
        super("Remote session has expired: " + sessionId);
    }
}
