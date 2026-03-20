package com.weekend.architect.unift.remote.controller;

import com.weekend.architect.unift.auth.service.JwtService;
import com.weekend.architect.unift.security.UniFtUserDetailsService;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.springframework.http.HttpHeaders;
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
 * <p>Browser WebSocket clients cannot set custom headers (e.g. {@code Authorization}) during
 * the upgrade request. The token is therefore passed as a WebSocket subprotocol value in the
 * {@code Sec-WebSocket-Protocol} header using the format {@code Bearer.<jwtToken>}.
 * {@link BearerProtocolHandshakeHandler} ensures the server echoes the protocol back so browsers
 * do not reject the upgrade response.
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

        if (request instanceof ServletServerHttpRequest) {
            // Extract the JWT from the Sec-WebSocket-Protocol header.
            // The client sends it as "Bearer.<token>"; we strip the prefix to get the raw JWT.
            String token = extractBearerToken(request.getHeaders());

            if (token == null) {
                log.warn("[ws-handshake] Missing or malformed Bearer token in Sec-WebSocket-Protocol header");
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

    // Extracts the raw JWT from a "Bearer.<token>" value inside Sec-WebSocket-Protocol.
    private static String extractBearerToken(HttpHeaders headers) {
        List<String> protocols = headers.get("Sec-WebSocket-Protocol");
        if (protocols == null) {
            return null;
        }
        for (String protocol : protocols) {
            // Each header value may itself be comma-separated; split defensively.
            for (String part : protocol.split(",")) {
                String trimmed = part.trim();
                if (trimmed.startsWith("Bearer.")) {
                    return trimmed.substring("Bearer.".length());
                }
            }
        }
        return null;
    }
}
