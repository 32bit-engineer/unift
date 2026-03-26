package com.weekend.architect.unift.common.stream;

import com.weekend.architect.unift.remote.core.TransferProgressCallback;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Wraps an {@link InputStream} and fires {@link TransferProgressCallback#onProgress} as bytes
 * are read, reporting cumulative bytes transferred.
 *
 * <p>Used in place of {@link com.jcraft.jsch.SftpProgressMonitor} for downloads to avoid the
 * internal {@code _stat()} call that {@code ChannelSftp.get(path, monitor)} issues when a
 * non-null monitor is provided. That stat call triggers an
 * {@link IndexOutOfBoundsException} in certain mwiede/jsch + OpenSSH server combinations.
 *
 * <p>Total bytes are reported as {@code -1} because the file size is unknown without {@code _stat}.
 * The service layer already initialises download transfers with {@code totalBytes = -1}.
 */
public class ProgressTrackingInputStream extends FilterInputStream {

    private final TransferProgressCallback callback;
    private long transferred = 0L;

    public ProgressTrackingInputStream(InputStream in, TransferProgressCallback callback) {
        super(in);
        this.callback = callback;
    }

    @Override
    public int read() throws IOException {
        int b = super.read();
        if (b != -1) {
            callback.onProgress(++transferred, -1L);
        }
        return b;
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
        int n = super.read(b, off, len);
        if (n > 0) {
            transferred += n;
            callback.onProgress(transferred, -1L);
        }
        return n;
    }
}
