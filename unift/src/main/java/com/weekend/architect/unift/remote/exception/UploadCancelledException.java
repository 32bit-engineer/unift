package com.weekend.architect.unift.remote.exception;

import lombok.Getter;

/**
 * Thrown from the streaming-upload service path when a cancellation token is detected after {@code
 * ChannelSftp.put()} returns.
 *
 * <p>This is intentionally <strong>not</strong> a subclass of {@link RemoteConnectionException} so
 * that it is not swallowed by the catch-all 502 handler. The global exception handler maps it to
 * <strong>HTTP 409 Conflict</strong>, which tells the HTTP client that the upload was cancelled —
 * preventing silent retries.
 */
@Getter
public class UploadCancelledException extends RuntimeException {

    private final String transferId;

    public UploadCancelledException(String transferId) {
        super("Upload transfer " + transferId + " was cancelled by user request");
        this.transferId = transferId;
    }
}
