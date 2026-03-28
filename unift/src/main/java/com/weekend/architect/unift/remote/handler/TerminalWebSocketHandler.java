package com.weekend.architect.unift.remote.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weekend.architect.unift.remote.config.TerminalProperties;
import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.exception.SessionExpiredException;
import com.weekend.architect.unift.remote.exception.SessionNotFoundException;
import com.weekend.architect.unift.remote.interceptor.TerminalHandshakeInterceptor;
import com.weekend.architect.unift.remote.model.TerminalSession;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import com.weekend.architect.unift.remote.registry.TerminalSessionRegistry;
import com.weekend.architect.unift.remote.service.TerminalEventPublisher;
import com.weekend.architect.unift.security.UniFtUserDetails;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PongMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * WebSocket handler that bridges a terminal UI (e.g., Xterm.js) with a remote PTY shell.
 *
 * <h6>Security controls</h6>
 * <ol>
 *   <li><b>Authentication</b> — JWT validated at handshake time by {@link TerminalHandshakeInterceptor}.
 *       Only authenticated requests reach this handler.</li>
 *   <li><b>Ownership</b> — every connection attempt verifies that the authenticated user owns
 *       the requested SSH session.  Any mismatch is logged as a security warning and rejected
 *       with close code {@code 4001}.</li>
 *   <li><b>Per-user cap</b> — enforced atomically by {@link TerminalSessionRegistry#registerIfUnderCap}.
 *       Excess connections are rejected with close code {@code 4029}.</li>
 *   <li><b>Global cap / thread exhaustion</b> — the pipe-thread pool is bounded to
 *       {@code maxConcurrentSessions} threads with a {@code AbortPolicy}; overflow is rejected
 *       gracefully.</li>
 * </ol>
 *
 * <h6>Wire protocol</h6>
 * <p>Client → Server (JSON text frames):
 * <pre>
 *   { "type": "input",  "data": "ls -la\n" }
 *   { "type": "resize", "cols": 220, "rows": 50 }
 * </pre>
 * <p>Server → Client: raw terminal output as UTF-8 text frames (Xterm.js compatible).
 *
 * <h6>WebSocket close codes</h6>
 * <table>
 *   <tr><th>Code</th><th>Meaning</th></tr>
 *   <tr><td>4001</td><td>Access denied — session not owned by authenticated user</td></tr>
 *   <tr><td>4000</td><td>SSH session not found, expired, or shell open failed</td></tr>
 *   <tr><td>4003</td><td>Remote connection does not support terminal access</td></tr>
 *   <tr><td>4008</td><td>Idle timeout (sent by {@link TerminalSessionRegistry} reaper)</td></tr>
 *   <tr><td>4029</td><td>Per-user or global terminal session cap exceeded</td></tr>
 * </table>
 */
@Slf4j
@Component
public class TerminalWebSocketHandler extends TextWebSocketHandler {

    private final TerminalProperties props;
    private final ObjectMapper objectMapper;
    private final SessionRegistry sessionRegistry;
    private final TerminalEventPublisher eventPublisher;
    private final TerminalSessionRegistry terminalRegistry;

    /**
     * Shared virtual-thread executor injected from {@link com.weekend.architect.unift.common.CommonBeans}.
     *
     * <p>Each pipe task blocks on {@code stdout.read()} for the lifetime of the session.
     * Virtual threads unmount from their carrier thread while blocked on I/O, so hundreds
     * of concurrent terminal sessions cost almost no OS resources.
     *
     * <p>Lifecycle (shutdown) is managed centrally by
     * {@link com.weekend.architect.unift.common.PreTermination} — do NOT call
     * {@code shutdown()} here.
     */
    private final ExecutorService outputExecutor;

    public TerminalWebSocketHandler(
            SessionRegistry sessionRegistry,
            TerminalSessionRegistry terminalRegistry,
            TerminalEventPublisher eventPublisher,
            ObjectMapper objectMapper,
            TerminalProperties props,
            @Qualifier("virtualThreadExecutor") ExecutorService virtualThreadExecutor) {
        this.sessionRegistry = sessionRegistry;
        this.terminalRegistry = terminalRegistry;
        this.eventPublisher = eventPublisher;
        this.objectMapper = objectMapper;
        this.props = props;
        this.outputExecutor = virtualThreadExecutor;
    }

    // Connection lifecycle

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession rawWsSession) throws Exception {
        // Extract the SSH session ID from the URL path: /ws/terminal/{sessionId}
        String path = Objects.requireNonNull(rawWsSession.getUri()).getPath();
        String sshSessionId = path.substring(path.lastIndexOf('/') + 1);

        // 1. Retrieve authenticated principal from handshake attributes ────
        UniFtUserDetails principal =
                (UniFtUserDetails) rawWsSession.getAttributes().get("userDetails");
        if (principal == null) {
            // Should never happen if TerminalHandshakeInterceptor is wired correctly
            log.error("[ws-terminal] No principal in WS attributes for session path {}", path);
            rawWsSession.close(new CloseStatus(4001, "Authentication required"));
            return;
        }
        UUID ownerId = principal.user().getId();

        log.info("[ws-terminal] Connection attempt — user={}, sshSession={}", ownerId, sshSessionId);

        // 2. Look up the SSH session
        RemoteConnection conn;
        try {
            conn = sessionRegistry.require(sshSessionId);
        } catch (SessionNotFoundException e) {
            log.warn("[ws-terminal] SSH session not found: {}", sshSessionId);
            rawWsSession.close(new CloseStatus(4000, "SSH session not found"));
            return;
        } catch (SessionExpiredException e) {
            log.warn("[ws-terminal] SSH session expired: {}", sshSessionId);
            rawWsSession.close(new CloseStatus(4000, "SSH session expired — reconnect first"));
            return;
        }

        // 3. Verify shell capability
        if (!(conn instanceof RemoteShell shellCapable)) {
            log.warn("[ws-terminal] Connection {} does not support terminal access", sshSessionId);
            rawWsSession.close(new CloseStatus(4003, "Remote connection does not support terminal access"));
            return;
        }

        // 4. SECURITY: ownership validation
        UUID sessionOwner = conn.getSession().getOwnerId();
        if (!sessionOwner.equals(ownerId)) {
            log.warn(
                    "[ws-terminal] SECURITY VIOLATION: user {} attempted to open terminal on session owned by {} (sshSession={})",
                    ownerId,
                    sessionOwner,
                    sshSessionId);
            rawWsSession.close(new CloseStatus(4001, "Access denied"));
            return;
        }

        // 5. Open PTY shell
        RemoteShell.ShellSession shell;
        try {
            shell = shellCapable.openShell("xterm-256color", 80, 24);
        } catch (Exception e) {
            log.error("[ws-terminal] Failed to open shell for {}: {}", sshSessionId, e.getMessage(), e);
            rawWsSession.close(new CloseStatus(4000, "Failed to open shell: " + e.getMessage()));
            return;
        }

        // 6. Wrap WS session for thread-safe concurrent sends

        // Both the pipe thread (stdout→WS) and the registry's ping task write to this
        // session concurrently. ConcurrentWebSocketSessionDecorator serialises those sends.
        ConcurrentWebSocketSessionDecorator concurrentWsSession = new ConcurrentWebSocketSessionDecorator(
                rawWsSession, props.getSendTimeoutMs(), props.getSendBufferSizeLimitBytes());

        // 7. Create the terminal session record
        TerminalSession terminalSession =
                TerminalSession.create(rawWsSession.getId(), sshSessionId, ownerId, shell, concurrentWsSession);

        // 8. Atomic per-user cap check + registration
        if (!terminalRegistry.registerIfUnderCap(terminalSession)) {
            shell.close();
            rawWsSession.close(new CloseStatus(
                    4029,
                    "Maximum terminal sessions (" + props.getMaxSessionsPerUser()
                            + ") reached. Close an existing terminal first."));
            return;
        }

        // 9. Submit pipe virtual thread
        try {
            outputExecutor.submit(() -> pipeShellToWebSocket(rawWsSession, shell));
        } catch (RejectedExecutionException e) {
            // Only reachable if the application is shutting down (executor already closed).
            log.warn("[ws-terminal] Executor shut down, rejecting terminal for {}", sshSessionId);
            terminalRegistry.remove(rawWsSession.getId(), "server-shutting-down");
            rawWsSession.close(new CloseStatus(4029, "Server is shutting down. Try again later."));
            return;
        }

        // 10. Publish opened event (non-critical)
        eventPublisher.publishOpened(terminalSession, conn.getSession().getHost());
        log.info(
                "[ws-terminal] ✓ Terminal session established — ws={}, ssh={}, user={}",
                rawWsSession.getId(),
                sshSessionId,
                ownerId);
    }

    @Override
    protected void handleTextMessage(@NonNull WebSocketSession wsSession, @NonNull TextMessage message)
            throws Exception {
        TerminalSession terminal = terminalRegistry.get(wsSession.getId()).orElse(null);
        if (terminal == null) {
            return; // session was already closed
        }

        JsonNode json = objectMapper.readTree(message.getPayload());
        String type = json.path("type").asText();

        switch (type) {
            case "input" -> {
                String data = json.path("data").asText();
                terminal.shellSession().getStdin().write(data.getBytes(StandardCharsets.UTF_8));
                terminal.shellSession().getStdin().flush();
                terminalRegistry.touchActivity(wsSession.getId());
            }
            case "resize" -> {
                int cols = json.path("cols").asInt(80);
                int rows = json.path("rows").asInt(24);
                // Clamp to sane bounds to prevent resource exhaustion / protocol abuse
                cols = Math.max(10, Math.min(cols, 500));
                rows = Math.max(5, Math.min(rows, 200));
                terminal.shellSession().resize(cols, rows);
                terminalRegistry.touchActivity(wsSession.getId());
            }
            default -> log.warn("[ws-terminal] Unknown message type '{}' from {}", type, wsSession.getId());
        }
    }

    /**
     * Called when the browser sends a Pong frame in response to a server-sent Ping.
     * Updates the idle timer so the reaper does not close a responsive-but-quiet session.
     */
    @Override
    protected void handlePongMessage(@NonNull WebSocketSession wsSession, @NonNull PongMessage message) {
        terminalRegistry.touchActivity(wsSession.getId());
        log.trace("[ws-terminal] Pong received from {}", wsSession.getId());
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession wsSession, @NonNull CloseStatus status) {
        log.info("[ws-terminal] Connection closed: {} (status: {})", wsSession.getId(), status);
        // Idempotent — remove() is a no-op if the pipe thread already cleaned up
        terminalRegistry.remove(wsSession.getId(), "client-disconnected");
    }

    @Override
    public void handleTransportError(@NonNull WebSocketSession wsSession, @NonNull Throwable exception) {
        log.warn("[ws-terminal] Transport error for {}: {}", wsSession.getId(), exception.getMessage());
        terminalRegistry.remove(wsSession.getId(), "transport-error");
    }

    // Shell pipe

    /**
     * Reads continuously from the shell's stdout and forwards each chunk as a UTF-8
     * text frame to the WebSocket client (Xterm.js compatible).
     *
     * <p>Runs on a thread from {@link #outputExecutor}. Exits when:
     * <ul>
     *   <li>the shell's stdout returns EOF ({@code read} returns {@code -1})</li>
     *   <li>the WebSocket session is closed</li>
     *   <li>a send fails (broken pipe to the browser)</li>
     * </ul>
     *
     * <p>The {@code finally} block calls {@link TerminalSessionRegistry#remove} which is
     * idempotent — it is safe if {@link #afterConnectionClosed} has already removed the entry.
     */
    private void pipeShellToWebSocket(WebSocketSession wsSession, RemoteShell.ShellSession shell) {
        InputStream stdout = shell.getStdout();
        byte[] buffer = new byte[8192];
        String wsId = wsSession.getId();

        try {
            int n;
            while (wsSession.isOpen() && (n = stdout.read(buffer)) != -1) {
                if (n > 0) {
                    String text = new String(buffer, 0, n, StandardCharsets.UTF_8);
                    try {
                        wsSession.sendMessage(new TextMessage(text));
                        terminalRegistry.touchActivity(wsId);
                    } catch (IOException sendEx) {
                        // The WS session closed mid-write — exit cleanly without logging noise
                        if (wsSession.isOpen()) {
                            log.warn("[ws-terminal] Send failed for {}: {}", wsId, sendEx.getMessage());
                        }
                        break;
                    }
                }
            }
        } catch (IOException readEx) {
            if (wsSession.isOpen()) {
                log.warn("[ws-terminal] Shell stdout read error for {}: {}", wsId, readEx.getMessage());
            }
        } finally {
            log.debug("[ws-terminal] Pipe closed for {} — cleaning up", wsId);
            // Idempotent — no-op if afterConnectionClosed already ran
            terminalRegistry.remove(wsId, "shell-eof");
            try {
                if (wsSession.isOpen()) {
                    wsSession.close(CloseStatus.NORMAL);
                }
            } catch (IOException ignored) {
                // Best-effort — session may already be closing
            }
        }
    }
}
