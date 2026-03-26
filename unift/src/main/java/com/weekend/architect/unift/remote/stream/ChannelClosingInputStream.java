package com.weekend.architect.unift.remote.stream;

import com.jcraft.jsch.ChannelSftp;
import com.weekend.architect.unift.common.stream.ProgressTrackingInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Wraps an {@link InputStream} and disconnects the dedicated download {@link ChannelSftp}
 * when the stream is closed.
 *
 * <p>Stacked on top of {@link ProgressTrackingInputStream}:
 * {@code close()} → closes the tracked stream → closes the raw JSch stream → then
 * disconnects the dedicated channel. This ensures the channel is released whether the
 * download completes normally, is canceled, or fails mid-transfer.
 */
public class ChannelClosingInputStream extends FilterInputStream {

    private final ChannelSftp channel;

    public ChannelClosingInputStream(InputStream in, ChannelSftp channel) {
        super(in);
        this.channel = channel;
    }

    @Override
    public void close() throws IOException {
        try {
            super.close();
        } finally {
            disconnectQuietly(channel);
        }
    }

    private static void disconnectQuietly(ChannelSftp channel) {
        if (channel != null && channel.isConnected()) {
            channel.disconnect();
        }
    }
}
