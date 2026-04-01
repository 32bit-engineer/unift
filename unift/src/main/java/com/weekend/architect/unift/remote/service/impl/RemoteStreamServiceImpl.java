package com.weekend.architect.unift.remote.service.impl;

import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.exception.SessionAccessDeniedException;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import com.weekend.architect.unift.remote.service.RemoteStreamService;
import java.io.InputStream;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Spring MVC implementation of {@link RemoteStreamService}.
 *
 * <p>Opens the remote SFTP {@link InputStream} on the calling thread and returns it directly to the
 * controller. The controller wraps it in a {@link
 * org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody}, which Spring MVC
 * executes on its async task executor — offloading the blocking SFTP read from the request thread
 * without any Reactor dependency.
 *
 * <p>{@code RemoteConnection} is <em>not</em> closed here. It is a long-lived session object owned
 * by {@link SessionRegistry}; only the {@link InputStream} is closed (by the controller's {@code
 * StreamingResponseBody}) after all bytes have been written.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RemoteStreamServiceImpl implements RemoteStreamService {

    private final SessionRegistry sessionRegistry;

    @Override
    public InputStream streamFile(String sessionId, UUID ownerId, String remotePath) {
        RemoteConnection conn = sessionRegistry.require(sessionId);

        if (!conn.getSession().getOwnerId().equals(ownerId)) {
            throw new SessionAccessDeniedException(sessionId);
        }

        log.debug("[{}] Opening SFTP stream ← '{}'", sessionId, remotePath);
        InputStream stream = conn.download(remotePath, (transferred, total) -> {});
        log.debug("[{}] SFTP stream opened ← '{}'", sessionId, remotePath);
        return stream;
    }
}
