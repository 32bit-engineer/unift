package com.weekend.architect.unift.remote.service;

import com.weekend.architect.unift.remote.model.TerminalSession;

/**
 * Publishes terminal lifecycle events to the audit bus (Kafka).
 *
 * <p>Implementations <strong>must never throw</strong> — event publishing failures are logged and
 * swallowed so they never propagate into the WebSocket data path.
 */
public interface TerminalEventPublisher {

    /**
     * Publishes a {@code terminal.session.opened} event after the PTY shell is live.
     *
     * @param session the newly registered terminal session
     * @param host the remote SSH host (included for audit context)
     */
    void publishOpened(TerminalSession session, String host);

    /**
     * Publishes a {@code terminal.session.closed} event when the terminal closes for any reason.
     *
     * @param session the terminal session that is closing
     * @param reason human-readable close reason (e.g., {@code "idle-timeout"}, {@code
     *     "client-disconnected"})
     */
    void publishClosed(TerminalSession session, String reason);
}
