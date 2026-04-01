package com.weekend.architect.unift.remote.core;

import com.weekend.architect.unift.remote.config.RemoteConnectionProperties;
import com.weekend.architect.unift.remote.credentials.RemoteCredentials;
import com.weekend.architect.unift.remote.enums.SessionState;
import com.weekend.architect.unift.remote.exception.ConnectionException;
import com.weekend.architect.unift.remote.exception.SessionExpiredException;
import com.weekend.architect.unift.remote.model.RemoteSession;
import lombok.extern.slf4j.Slf4j;

/**
 * Abstract base for all remote connections.
 *
 * <h6>Template Method Pattern</h6>
 *
 * <p>This class owns the connection lifecycle (state machine) as {@code final} methods and
 * delegates the actual transport work to abstract hooks that subclasses must implement:
 *
 * <pre>
 *  connect(creds)          → doConnect(creds)         [abstract]
 *  close()                 → preClose() + doClose()   [preClose is a no-op hook]
 *  isConnected()           → SessionState check       [concrete, final]
 *  getSessionId()          → session field             [concrete, final]
 *  getSession()            → session field             [concrete, final]
 * </pre>
 *
 * <p>File-operation methods ({@link #upload}, {@link #download}, {@link #list}, {@link #delete},
 * {@link #rename}, {@link #mkdir}, {@link #homeDirectory}) are left abstract here so each subclass
 * provides a transport-specific implementation.
 *
 * <h6>Session lifecycle</h6>
 *
 * <pre>
 *  INITIALIZING ──connect()──► ACTIVE ──close()──► CLOSED
 *                                  └──────────────► EXPIRED  (set by SessionReaper)
 *                 any state on error ──────────────► ERROR
 * </pre>
 */
@Slf4j
public abstract class AbstractRemoteConnection implements RemoteConnection {

    protected final RemoteSession session;
    protected final RemoteConnectionProperties props;

    protected AbstractRemoteConnection(RemoteSession session, RemoteConnectionProperties props) {
        this.session = session;
        this.props = props;
    }

    /**
     * Template method: validates credentials, delegates to {@link #doConnect}, and transitions the
     * session to {@link SessionState#ACTIVE}.
     */
    @Override
    public final void connect(RemoteCredentials credentials) throws ConnectionException {
        log.info(
                "[{}] Connecting to {}:{} via {}",
                session.getSessionId(),
                credentials.getHost(),
                credentials.getPort(),
                credentials.getProtocol());
        try {
            validateCredentials(credentials);
            doConnect(credentials);
            session.setState(SessionState.ACTIVE);
            log.info("[{}] Connected successfully", session.getSessionId());
        } catch (ConnectionException ce) {
            session.setState(SessionState.ERROR);
            throw ce;
        } catch (Exception e) {
            session.setState(SessionState.ERROR);
            throw new ConnectionException("Failed to connect to " + credentials.getHost() + ": " + e.getMessage(), e);
        }
    }

    /**
     * Template method: calls {@link #preClose()} (no-op by default), then {@link #doClose()}, and
     * transitions the session to {@link SessionState#CLOSED}. Idempotent.
     */
    @Override
    public final void close() {
        if (session.getState() == SessionState.CLOSED) {
            return;
        }
        log.info("[{}] Closing connection", session.getSessionId());
        try {
            preClose();
            doClose();
        } catch (Exception e) {
            log.warn("[{}] Error during close (ignored): {}", session.getSessionId(), e.getMessage());
        } finally {
            session.setState(SessionState.CLOSED);
            log.info("[{}] Connection closed", session.getSessionId());
        }
    }

    @Override
    public final boolean isConnected() {
        return session.getState() == SessionState.ACTIVE;
    }

    @Override
    public final String getSessionId() {
        return session.getSessionId();
    }

    @Override
    public final RemoteSession getSession() {
        return session;
    }

    /**
     * Asserts that the session is active and not expired. Call this at the top of every
     * file-operation method.
     */
    protected final void assertActive() {
        if (session.isExpired()) {
            session.setState(SessionState.EXPIRED);
            throw new SessionExpiredException(session.getSessionId());
        }
        if (session.getState() != SessionState.ACTIVE) {
            throw new ConnectionException(
                    "Session " + session.getSessionId() + " is not active (state=" + session.getState() + ")");
        }
        // Slide the TTL window on every activity
        session.renewTtl();
    }

    // Template hooks — subclasses implement

    /**
     * Validate the credentials before attempting a connection. Throw {@link
     * com.weekend.architect.unift.remote.exception.CredentialValidationException} for invalid
     * input.
     */
    protected abstract void validateCredentials(RemoteCredentials credentials);

    /**
     * Open the physical transport (e.g. JSch session + SFTP channel).
     *
     * @throws Exception any transport-level error; wrapped into {@link ConnectionException} by the
     *     template
     */
    protected abstract void doConnect(RemoteCredentials credentials) throws Exception;

    /**
     * Release all transport resources (channels, sockets, etc.). Must be idempotent. Called with
     * the session still in ACTIVE or EXPIRED state.
     */
    protected abstract void doClose();

    /**
     * Optional hook called just before {@link #doClose()}. Subclasses may override to flush
     * in-flight transfers or log statistics. Default implementation is a no-op.
     */
    protected void preClose() {
        // no-op; override in subclasses if needed
    }
}
