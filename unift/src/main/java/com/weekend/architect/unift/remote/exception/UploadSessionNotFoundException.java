package com.weekend.architect.unift.remote.exception;

import java.util.UUID;

/** Thrown when an upload-session ID cannot be found or does not belong to the requesting user. */
public class UploadSessionNotFoundException extends RuntimeException {

    public UploadSessionNotFoundException(UUID id) {
        super("Upload session not found: " + id);
    }
}
