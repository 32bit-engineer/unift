package com.weekend.architect.unift.remote.exception;

import java.util.UUID;

/** Thrown when a saved host ID cannot be found or does not belong to the requesting user. */
public class SavedHostNotFoundException extends RuntimeException {

    public SavedHostNotFoundException(UUID id) {
        super("Saved host not found: " + id);
    }
}
