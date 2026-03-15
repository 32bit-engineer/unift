package com.weekend.architect.unift.remote.model;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import com.weekend.architect.unift.remote.enums.SessionState;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Builder;
import lombok.Data;

/**
 * Mutable session envelope that tracks the lifecycle of one remote connection.
 *
 * <p>This is NOT stored in any database – it lives in the in-memory
 * {@code SessionRegistry} and is discarded when the session closes or expires.
 *
 * <p>Thread-safety note: {@code state} and {@code expiresAt} are declared
 * {@code volatile} so that the {@code SessionReaper} thread and request threads
 * can read/write them without locking the whole object.
 */
@Data
@Builder
public class RemoteSession {

    /** UUID v7 – time-ordered, unique session identifier. */
    private final String sessionId;

    /** The authenticated UniFT user who owns this session. */
    private final UUID ownerId;

    private final ProtocolType protocol;
    private final String host;
    private final int port;
    private final String username;

    private final OffsetDateTime createdAt;

    /** TTL in minutes captured at creation; used by {@link #renewTtl()}. */
    private final long ttlMinutes;

    /** Whether the TTL window is sliding (reset on each activity). */
    private final boolean slidingTtl;

    // --- mutable fields ---

    private volatile SessionState state;
    private volatile OffsetDateTime expiresAt;

    // -- Lifecycle helpers ---
    /**
     * Returns {@code true} if the session's TTL has elapsed.
     */
    public boolean isExpired() {
        return expiresAt != null && OffsetDateTime.now().isAfter(expiresAt);
    }

    /**
     * Extends {@code expiresAt} by the original {@code ttlMinutes} from now.
     * Called on every activity when sliding-TTL is enabled.
     */
    public void renewTtl() {
        if (slidingTtl) {
            this.expiresAt = OffsetDateTime.now().plusMinutes(ttlMinutes);
        }
    }
}
