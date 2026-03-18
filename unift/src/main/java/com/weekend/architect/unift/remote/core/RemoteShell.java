package com.weekend.architect.unift.remote.core;

import java.io.InputStream;
import java.io.OutputStream;

/**
 * Capability interface for connections that support interactive shell access.
 */
public interface RemoteShell {

    /**
     * Opens a new interactive shell session.
     *
     * @param termType terminal type (e.g., "xterm-256color")
     * @param cols     initial terminal width (columns)
     * @param rows     initial terminal height (rows)
     * @return a live shell session; must be closed by the caller
     * @throws Exception if the shell cannot be opened
     */
    ShellSession openShell(String termType, int cols, int rows) throws Exception;

    /**
     * Represents a live interactive shell session.
     */
    interface ShellSession extends AutoCloseable {
        InputStream getStdout();

        OutputStream getStdin();

        void resize(int cols, int rows);

        @Override
        void close();
    }
}
