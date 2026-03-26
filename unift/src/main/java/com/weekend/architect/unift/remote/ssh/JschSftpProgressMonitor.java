package com.weekend.architect.unift.remote.ssh;

import com.jcraft.jsch.SftpProgressMonitor;
import com.weekend.architect.unift.remote.core.CancellationToken;
import com.weekend.architect.unift.remote.core.TransferProgressCallback;

/**
 * Bridges JSch's {@link SftpProgressMonitor} API to our
 * {@link TransferProgressCallback} functional interface.
 *
 * <p>JSch calls {@link #count(long)} for each chunk that has been transferred.
 * Note: JSch passes the <em>delta</em> (bytes in this chunk), not the
 * cumulative total, so we accumulate here.
 *
 * <p>When a {@link CancellationToken} is provided and cancelled,
 * {@link #count(long)} returns {@code false} — JSch's built-in signal to
 * abort the copy loop immediately.  The remote file is left in a partial
 * state; the service layer deletes it after detecting the cancellation.
 */
class JschSftpProgressMonitor implements SftpProgressMonitor {

    private final TransferProgressCallback callback;
    private final CancellationToken cancellationToken; // null for non-cancellable uploads
    private long totalBytes;
    private long transferred;

    JschSftpProgressMonitor(TransferProgressCallback callback, CancellationToken cancellationToken) {
        this.callback = callback;
        this.cancellationToken = cancellationToken;
    }

    @Override
    public void init(int op, String src, String dest, long max) {
        this.totalBytes = max;
        this.transferred = 0L;
    }

    /**
     * @param count bytes transferred in this chunk (delta)
     * @return {@code true} to continue; {@code false} cancels the transfer (JSch will stop the copy loop)
     */
    @Override
    public boolean count(long count) {
        transferred += count;
        callback.onProgress(transferred, totalBytes);
        // Returning false here is JSch's official way to abort an in-progress transfer.
        // JSch breaks out of its write loop, closes the remote file, and put() returns normally.
        return cancellationToken == null || !cancellationToken.isCancelled();
    }

    @Override
    public void end() {
        // Signal 100% on completion
        callback.onProgress(totalBytes > 0 ? totalBytes : transferred, totalBytes);
    }
}
