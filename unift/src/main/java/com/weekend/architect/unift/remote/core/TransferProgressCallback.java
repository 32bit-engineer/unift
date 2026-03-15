package com.weekend.architect.unift.remote.core;

/**
 * Functional callback invoked by the connection layer as bytes are transferred.
 * The service layer provides a lambda that updates the {@code TransferRegistry}.
 */
@FunctionalInterface
public interface TransferProgressCallback {

    /**
     * Called each time a chunk of bytes has been sent or received.
     *
     * @param bytesTransferred cumulative bytes transferred so far
     * @param totalBytes       total file size; {@code -1} if unknown
     */
    void onProgress(long bytesTransferred, long totalBytes);

    /** A no-op callback useful in tests or when progress tracking is not needed. */
    static TransferProgressCallback noop() {
        return (transferred, total) -> {};
    }
}
