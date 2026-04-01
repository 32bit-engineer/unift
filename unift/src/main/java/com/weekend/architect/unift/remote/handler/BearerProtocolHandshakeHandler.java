package com.weekend.architect.unift.remote.handler;

import java.util.List;
import org.jspecify.annotations.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

/**
 * Handshake handler that supports the {@code Bearer.<token>} subprotocol convention.
 *
 * <p>Browser WebSocket clients cannot set custom HTTP headers (e.g. {@code Authorization}) during
 * the WebSocket upgrade handshake. As a standards-compliant workaround, the JWT is transmitted as a
 * WebSocket subprotocol in the format {@code Bearer.<token>}.
 *
 * <p>The WebSocket spec (RFC 6455) requires the server to echo back one of the client-requested
 * subprotocols, otherwise the browser will reject the connection. This handler intercepts protocol
 * negotiation and returns the {@code Bearer.*} protocol unchanged so the handshake completes
 * successfully.
 */
@Component
public class BearerProtocolHandshakeHandler extends DefaultHandshakeHandler {

    private static final String BEARER_PREFIX = "Bearer.";

    /**
     * Selects the {@code Bearer.<token>} subprotocol from the client's requested list so the
     * browser accepts the server's upgrade response.
     *
     * <p>Returns {@code null} (no protocol) if no Bearer subprotocol is present, which will cause
     * the handshake to fail cleanly via the upstream interceptor's auth check.
     *
     * @param requestedProtocols subprotocols sent by the client in {@code Sec-WebSocket-Protocol}
     * @param wsHandler the target WebSocket handler (unused here)
     * @return the matched {@code Bearer.*} protocol string, or {@code null}
     */
    @Override
    protected String selectProtocol(@NonNull List<String> requestedProtocols, @NonNull WebSocketHandler wsHandler) {
        for (String protocol : requestedProtocols) {
            if (protocol.startsWith(BEARER_PREFIX)) {
                return protocol;
            }
        }
        return null;
    }
}
