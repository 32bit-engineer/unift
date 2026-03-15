package com.weekend.architect.unift.remote.ssh;

import com.jcraft.jsch.SftpProgressMonitor;
import com.weekend.architect.unift.remote.core.TransferProgressCallback;
import lombok.RequiredArgsConstructor;

/**
 * Bridges JSch's {@link SftpProgressMonitor} API to our
 * {@link TransferProgressCallback} functional interface.
 *
 * <p>JSch calls {@link #count(long)} for each chunk that has been transferred.
 * Note: JSch passes the <em>delta</em> (bytes in this chunk), not the
 * cumulative total, so we accumulate here.
 */
@RequiredArgsConstructor
class JschSftpProgressMonitor implements SftpProgressMonitor {

    private final TransferProgressCallback callback;
    private long totalBytes;
    private long transferred;

    @Override
    public void init(int op, String src, String dest, long max) {
        this.totalBytes = max;
        this.transferred = 0L;
    }

    /**
     * @param count bytes transferred in this chunk (delta)
     * @return {@code true} to continue; {@code false} would cancel the transfer
     */
    @Override
    public boolean count(long count) {
        transferred += count;
        callback.onProgress(transferred, totalBytes);
        return true; // never cancel from the progress monitor
    }

    @Override
    public void end() {
        // Signal 100% on completion
        callback.onProgress(totalBytes > 0 ? totalBytes : transferred, totalBytes);
    }
}
