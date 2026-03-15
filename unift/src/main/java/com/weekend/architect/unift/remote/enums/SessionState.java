package com.weekend.architect.unift.remote.enums;

/**
 * Lifecycle state of a {@code RemoteSession}.
 *
 * <pre>
 *  INITIALIZING → ACTIVE ─┬─→ CLOSED
 *                         └─→ EXPIRED → (reaped)
 *  Any state → ERROR
 * </pre>
 */
public enum SessionState {
    /** Session object created; connection not yet established. */
    INITIALIZING,

    /** Connection is open and ready to use. */
    ACTIVE,

    /** TTL elapsed; session is being / has been reaped. */
    EXPIRED,

    /** Explicitly closed by the user or the server. */
    CLOSED,

    /** An unrecoverable error occurred during connect / operation. */
    ERROR
}
