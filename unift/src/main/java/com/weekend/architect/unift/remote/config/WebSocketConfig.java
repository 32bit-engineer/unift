package com.weekend.architect.unift.remote.config;

import com.weekend.architect.unift.remote.handler.BearerProtocolHandshakeHandler;
import com.weekend.architect.unift.remote.handler.TerminalWebSocketHandler;
import com.weekend.architect.unift.remote.interceptor.TerminalHandshakeInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * Configuration for UniFT's WebSocket-based features.
 *
 * <p>Registers the terminal UI bridge with a dedicated JWT handshake interceptor.
 */
@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final TerminalWebSocketHandler terminalWebSocketHandler;
    private final TerminalHandshakeInterceptor terminalHandshakeInterceptor;
    private final BearerProtocolHandshakeHandler bearerProtocolHandshakeHandler;
    private final TerminalProperties terminalProperties;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        String[] allowedOrigins = terminalProperties.getAllowedOrigins().toArray(String[]::new);

        // - API-prefixed (e.g. behind reverse proxies): /api/ws/terminal/{sshSessionId}
        registry.addHandler(terminalWebSocketHandler, "/api/ws/*")
                .setHandshakeHandler(bearerProtocolHandshakeHandler)
                .addInterceptors(terminalHandshakeInterceptor)
                // Restrict to configured origins — never use "*" for WebSocket
                .setAllowedOrigins(allowedOrigins);

        registry.addHandler(terminalWebSocketHandler, "/api/ws/terminal/*")
                .setHandshakeHandler(bearerProtocolHandshakeHandler)
                .addInterceptors(terminalHandshakeInterceptor)
                .setAllowedOrigins(allowedOrigins);
    }
}
