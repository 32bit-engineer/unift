package com.weekend.architect.unift.remote.exception;

/** Thrown when the user already has {@code maxSessionsPerUser} active sessions. */
public class MaxSessionsExceededException extends RemoteConnectionException {

    public MaxSessionsExceededException(int max) {
        super("Maximum concurrent sessions (" + max + ") reached. Close an existing session first.");
    }
}
