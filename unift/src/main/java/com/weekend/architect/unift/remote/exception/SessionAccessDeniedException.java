package com.weekend.architect.unift.remote.exception;

/** Thrown when the requesting user does not own the session. */
public class SessionAccessDeniedException extends RemoteConnectionException {

    public SessionAccessDeniedException(String sessionId) {
        super("Access denied to session: " + sessionId);
    }
}
