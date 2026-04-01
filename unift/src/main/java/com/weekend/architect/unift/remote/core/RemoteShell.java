package com.weekend.architect.unift.remote.core;

import java.io.InputStream;
import java.io.OutputStream;

/** Capability interface for connections that support interactive shell access. */
public interface RemoteShell {

    /**
     * Executes a non-interactive command on the remote host and returns trimmed stdout.
     *
     * <p>The default implementation throws {@link UnsupportedOperationException}; SSH-capable
     * subclasses (e.g. {@code SshRemoteConnection}) override this to open a short-lived exec
     * channel and return the command's output.
     *
     * <p>Callers should treat any exception as a soft failure and fall back gracefully.
     *
     * @param command shell command to run on the remote host
     * @return trimmed stdout output, never {@code null}
     * @throws Exception if the command cannot be executed
     */
    default String executeCommand(String command) throws Exception {
        throw new UnsupportedOperationException("executeCommand not supported by this connection type");
    }

    /**
     * Opens a new interactive shell session.
     *
     * @param termType terminal type (e.g., "xterm-256color")
     * @param cols initial terminal width (columns)
     * @param rows initial terminal height (rows)
     * @return a live shell session; must be closed by the caller
     * @throws Exception if the shell cannot be opened
     */
    ShellSession openShell(String termType, int cols, int rows) throws Exception;

    /** Represents a live interactive shell session. */
    interface ShellSession extends AutoCloseable {
        InputStream getStdout();

        OutputStream getStdin();

        void resize(int cols, int rows);

        @Override
        void close();
    }
}
