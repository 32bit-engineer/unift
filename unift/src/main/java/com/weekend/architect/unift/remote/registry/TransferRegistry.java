package com.weekend.architect.unift.remote.registry;

import com.weekend.architect.unift.common.cache.namedcache.TransferCache;
import com.weekend.architect.unift.remote.config.RemoteConnectionProperties;
import com.weekend.architect.unift.remote.enums.TransferState;
import com.weekend.architect.unift.remote.exception.RemoteOperationException;
import com.weekend.architect.unift.remote.model.RemoteTransfer;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * In-memory registry of all in-flight and recently-completed file transfers.
 *
 * <h6>Eviction strategy</h6>
 * <p>Backed by a {@link TransferCache} (Caffeine by default, swappable to Redis):
 * <ul>
 *   <li>Active transfers ({@code PENDING}, {@code IN_PROGRESS}) — stored with no TTL;
 *       they live until {@link #removeBySession} / {@link #remove} is called.</li>
 *   <li>Terminal transfers ({@code COMPLETED}, {@code FAILED}, {@code CANCELLED}) —
 *       stored with an explicit TTL of {@code unift.remote.transfer-terminal-ttl-minutes}
 *       (default 30 min).  The cache evicts them automatically, resolving the H3 memory
 *       leak without any separate scheduler.</li>
 * </ul>
 *
 * <h6>TTL trigger</h6>
 * <p>When {@link #updateState} transitions a transfer to a terminal state it calls
 * {@code store.put(id, transfer, ttl)}.  This explicitly passes the expiry to the
 * {@link TransferCache} — no re-insert trick, no Caffeine-specific API required.
 * A Redis implementation handles it identically via {@code SET k v EX seconds}.
 *
 * <h6>Thread-safety</h6>
 * <p>Delegated entirely to the {@link TransferCache} implementation.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TransferRegistry {

    private static final Set<TransferState> TERMINAL_STATES =
            Set.of(TransferState.COMPLETED, TransferState.FAILED, TransferState.CANCELLED);

    private final RemoteConnectionProperties props;

    /** transferId → transfer record */
    private final TransferCache store;

    /**
     * Registers a new transfer (typically in {@link TransferState#PENDING}).
     * No TTL is applied — active transfers live until explicitly removed.
     */
    public void register(RemoteTransfer transfer) {
        store.put(transfer.getTransferId(), transfer);
        log.debug("[transfer-registry] Registered transfer {}", transfer.getTransferId());
    }

    /**
     * Returns the transfer for the given ID.
     *
     * @throws RemoteOperationException if not found (or already evicted after TTL)
     */
    public RemoteTransfer require(String transferId) {
        RemoteTransfer t = store.getIfPresent(transferId);
        if (t == null) {
            throw new RemoteOperationException("Transfer not found: " + transferId);
        }
        return t;
    }

    /**
     * Transitions a transfer to a new state.
     *
     * <p>When {@code newState} is terminal ({@code COMPLETED}, {@code FAILED},
     * {@code CANCELLED}), the entry is re-stored with an explicit TTL so the cache
     * automatically evicts it after {@code unift.remote.transfer-terminal-ttl-minutes}.
     * No scheduler or Caffeine-specific API is needed — the TTL is passed directly
     * to {@link TransferCache#put(Object, Object, Duration)}, making the behaviour
     * identical for any cache backend (Caffeine today, Redis tomorrow).
     *
     * @param transferId target transfer ID
     * @param newState   the state to transition to
     */
    public void updateState(String transferId, TransferState newState) {
        RemoteTransfer t = store.getIfPresent(transferId);
        if (t == null) return;

        t.setState(newState);

        if (TERMINAL_STATES.contains(newState)) {
            Duration ttl = Duration.ofMinutes(props.getTransferTerminalTtlMinutes());
            store.put(transferId, t, ttl);
            log.debug(
                    "[transfer-registry] Transfer {} → {} (terminal; TTL eviction in {} min)",
                    transferId,
                    newState,
                    ttl.toMinutes());
        } else {
            log.debug("[transfer-registry] Transfer {} → {}", transferId, newState);
        }
    }

    /**
     * Returns all transfers associated with the given session.
     */
    public List<RemoteTransfer> getBySession(String sessionId) {
        return store.values().stream()
                .filter(t -> sessionId.equals(t.getSessionId()))
                .toList();
    }

    /**
     * Immediately removes all transfers for the given session (called on session close).
     * Performs eager cleanup regardless of any pending TTL window.
     */
    public void removeBySession(String sessionId) {
        int removed = store.removeIf(t -> sessionId.equals(t.getSessionId()));
        log.debug("[transfer-registry] Cleared {} transfer(s) for session {}", removed, sessionId);
    }

    /** Immediately removes a single transfer record. */
    public void remove(String transferId) {
        store.invalidate(transferId);
    }
}
