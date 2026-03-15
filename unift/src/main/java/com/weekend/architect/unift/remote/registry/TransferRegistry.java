package com.weekend.architect.unift.remote.registry;

import com.weekend.architect.unift.remote.enums.TransferState;
import com.weekend.architect.unift.remote.exception.RemoteOperationException;
import com.weekend.architect.unift.remote.model.RemoteTransfer;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * In-memory registry of all in-flight and recently-completed file transfers.
 *
 * <p>Transfer entries are created by the service layer before a transfer
 * starts and updated throughout its lifecycle.  The service layer is
 * responsible for cleanup (e.g., removing transfers when their owning
 * session is closed).
 */
@Slf4j
@Component
public class TransferRegistry {

    /** transferId → transfer state */
    private final ConcurrentHashMap<String, RemoteTransfer> store = new ConcurrentHashMap<>();

    /**
     * Registers a new transfer (must be in {@link TransferState#PENDING}).
     */
    public void register(RemoteTransfer transfer) {
        store.put(transfer.getTransferId(), transfer);
        log.debug("[transfer-registry] Registered transfer {}", transfer.getTransferId());
    }

    /**
     * Returns the transfer for the given ID.
     *
     * @throws RemoteOperationException if not found
     */
    public RemoteTransfer require(String transferId) {
        RemoteTransfer t = store.get(transferId);
        if (t == null) {
            throw new RemoteOperationException("Transfer not found: " + transferId);
        }
        return t;
    }

    /**
     * Transitions a transfer to a new state.
     *
     * @param transferId target transfer ID
     * @param newState   the state to transition to
     */
    public void updateState(String transferId, TransferState newState) {
        RemoteTransfer t = store.get(transferId);
        if (t != null) {
            t.setState(newState);
            log.debug("[transfer-registry] Transfer {} → {}", transferId, newState);
        }
    }

    /**
     * Returns all transfers associated with the given session, in insertion order.
     */
    public List<RemoteTransfer> getBySession(String sessionId) {
        return store.values().stream()
                .filter(t -> sessionId.equals(t.getSessionId()))
                .toList();
    }

    /**
     * Removes all transfers for the given session (called on session close).
     */
    public void removeBySession(String sessionId) {
        store.values().removeIf(t -> sessionId.equals(t.getSessionId()));
        log.debug("[transfer-registry] Cleared transfers for session {}", sessionId);
    }

    /** Removes a single transfer record. */
    public void remove(String transferId) {
        store.remove(transferId);
    }
}
