package com.weekend.architect.unift.remote.model;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import com.weekend.architect.unift.remote.enums.SessionState;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import lombok.Builder;
import lombok.Data;

/**
 * Mutable session envelope that tracks the lifecycle of one remote connection.
 *
 * <p>This is NOT stored in any database – it lives in the in-memory
 * {@code SessionRegistry} and is discarded when the session closes or expires.
 *
 * <h6>Thread-safety</h6>
 * <ul>
 *   <li>{@code state} is {@code volatile}: the {@code SessionReaper} thread and request
 *       threads can read/write it without locking.</li>
 *   <li>{@code expiresAt} is an {@link AtomicReference}: {@link #renewTtl()} calls
 *       {@code atomicExpiresAt.set(now + ttlMinutes)} which does <em>not</em> read the
 *       existing value before writing, so there is no read-compute-write race.
 *       Two concurrent {@code renewTtl()} calls both compute {@code now + ttlMinutes}
 *       independently and the last write wins — both are valid future timestamps,
 *       making this safe without CAS or locking (L1 resolved).</li>
 * </ul>
 */
@Data
@Builder
public class RemoteSession {

    /** UUID v7 – time-ordered, unique session identifier. */
    private final String sessionId;

    /** The authenticated UniFT user who owns this session. */
    private final UUID ownerId;

    /**
     * The saved-host entry that was used to open this session, or {@code null}
     * when the session was created via a direct (ad-hoc) connect call.
     */
    private final UUID savedHostId;

    /** Friendly alias for this connection. */
    private final String label;

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
    private AtomicReference<OffsetDateTime> atomicExpiresAt;

    /**
     * OS or service name detected after a successful connect, e.g.
     * "Ubuntu 22.04.3 LTS", "Debian GNU/Linux 12", "Amazon S3".
     * {@code null} until detection completes.
     */
    private volatile String remoteOs;

    public OffsetDateTime getExpiresAt() {
        return this.atomicExpiresAt.get();
    }

    /**
     * Returns {@code true} if the session's TTL has elapsed.
     */
    public boolean isExpired() {
        OffsetDateTime exp = atomicExpiresAt.get();
        return exp != null && OffsetDateTime.now().isAfter(exp);
    }

    /**
     * Extends {@code expiresAt} by the original {@code ttlMinutes} from now.
     * Called on every activity when sliding-TTL is enabled.
     */
    public void renewTtl() {
        if (!slidingTtl) return;
        this.atomicExpiresAt.set(OffsetDateTime.now().plusMinutes(ttlMinutes));
    }
}
