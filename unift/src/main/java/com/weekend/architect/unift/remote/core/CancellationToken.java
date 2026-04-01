package com.weekend.architect.unift.remote.core;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * A lightweight, thread-safe cancellation flag.
 *
 * <p>The cancel-transfer API endpoint calls {@link #cancel()} from its request thread; the upload
 * thread checks {@link #isCancelled()} via {@link
 * com.weekend.architect.unift.remote.core.CancellableInputStream} before each {@code read()},
 * allowing it to abort cleanly without interrupting the underlying SSH connection.
 */
public final class CancellationToken {

    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    /** Signals cancellation. Thread-safe; idempotent. */
    public void cancel() {
        cancelled.set(true);
    }

    /** Returns {@code true} if {@link #cancel()} has been called. */
    public boolean isCancelled() {
        return cancelled.get();
    }
}
