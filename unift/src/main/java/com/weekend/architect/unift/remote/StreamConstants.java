package com.weekend.architect.unift.remote;

/** Shared constants for SSE streaming endpoints. */
public final class StreamConstants {

    /** Maximum duration an SSE stream remains open without a client disconnect (30 minutes). */
    public static final long STREAM_TIMEOUT_MS = 30L * 60 * 1000;

    /**
     * Minimum allowed polling interval for most SSE streams (1 second).
     *
     * @see #MIN_TRANSFER_STREAM_INTERVAL_MS
     */
    public static final int MIN_STREAM_INTERVAL_MS = 1000;

    /**
     * Minimum allowed polling interval for the transfer-status SSE stream (500 ms).
     * Transfer streams use a tighter floor to allow near-real-time progress updates.
     */
    public static final int MIN_TRANSFER_STREAM_INTERVAL_MS = 500;

    /** Maximum allowed polling interval for all SSE streams (60 seconds). */
    public static final int MAX_STREAM_INTERVAL_MS = 60_000;

    private StreamConstants() {}
}
