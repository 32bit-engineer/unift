package com.weekend.architect.unift.remote.controller;

import com.weekend.architect.unift.auth.service.JwtService;
import com.weekend.architect.unift.security.UniFtUserDetailsService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

/**
 * Interceptor that validates the JWT token during the WebSocket handshake.
 *
 * <p>Since browser WebSocket clients cannot send custom headers (like Authorization),
 * we support passing the token as a 'token' query parameter.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TerminalHandshakeInterceptor implements HandshakeInterceptor {

    private final JwtService jwtService;
    private final UniFtUserDetailsService userDetailsService;

    @Override
    public boolean beforeHandshake(
            @NonNull ServerHttpRequest request,
            @NonNull ServerHttpResponse response,
            @NonNull WebSocketHandler wsHandler,
            @NonNull Map<String, Object> attributes) {

        if (request instanceof ServletServerHttpRequest servletRequest) {
            // Browsers cannot send custom headers on WebSocket upgrades,
            // so the JWT is passed as a query parameter: ?token=<accessToken>
            String token = servletRequest.getServletRequest().getParameter("token");

            if (token == null) {
                log.warn("[ws-handshake] Missing token in terminal connection request");
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }

            try {
                String username = jwtService.extractUsername(token);
                if (username != null) {
                    UserDetails userDetails = userDetailsService.loadUserByUsername(username);
                    if (jwtService.isAccessTokenValid(token, userDetails)) {
                        // Success! Pass the user details to the WebSocket session
                        attributes.put("username", username);
                        attributes.put("userDetails", userDetails);

                        // Set the security context for this thread (the handshake request)
                        UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                                userDetails, null, userDetails.getAuthorities());
                        SecurityContextHolder.getContext().setAuthentication(authToken);

                        return true;
                    }
                }
            } catch (Exception e) {
                log.error("[ws-handshake] Token validation failed: {}", e.getMessage());
            }
        }

        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        return false;
    }

    @Override
    public void afterHandshake(
            @NonNull ServerHttpRequest request,
            @NonNull ServerHttpResponse response,
            @NonNull WebSocketHandler wsHandler,
            Exception exception) {
        // No-op
    }
}
