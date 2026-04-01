package com.weekend.architect.unift.remote.core;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;

/**
 * An {@link InputStream} wrapper that aborts reading when a {@link CancellationToken} is set.
 *
 * <p>Each {@code read} call checks the token <em>before</em> delegating to the underlying stream.
 * When cancelled, an {@link InterruptedIOException} is thrown. JSch's {@code ChannelSftp.put()}
 * surfaces this as a {@code TransferException}, which the service layer catches to mark the
 * transfer as {@code CANCELLED} and clean up the partial remote file.
 */
public final class CancellableInputStream extends FilterInputStream {

    private final CancellationToken token;

    public CancellableInputStream(InputStream in, CancellationToken token) {
        super(in);
        this.token = token;
    }

    @Override
    public int read() throws IOException {
        checkCancelled();
        return super.read();
    }

    @Override
    public int read(byte[] b) throws IOException {
        checkCancelled();
        return super.read(b);
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
        checkCancelled();
        return super.read(b, off, len);
    }

    private void checkCancelled() throws InterruptedIOException {
        if (token.isCancelled()) {
            throw new InterruptedIOException("Upload cancelled by user request");
        }
    }
}
