package com.weekend.architect.unift.remote.config;

import com.weekend.architect.unift.remote.controller.TerminalHandshakeInterceptor;
import com.weekend.architect.unift.remote.controller.TerminalWebSocketHandler;
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
    private final TerminalProperties terminalProperties;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(terminalWebSocketHandler, "/ws/terminal/*")
                .addInterceptors(terminalHandshakeInterceptor)
                // Restrict to configured origins — never use "*" for WebSocket
                .setAllowedOrigins(terminalProperties.getAllowedOrigins().toArray(String[]::new));
    }
}
