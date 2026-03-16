package com.weekend.architect.unift.remote.service;

import java.io.InputStream;
import java.util.UUID;

/**
 * Service for opening a raw {@link InputStream} to a remote file over an active session.
 *
 * <p>This service is intentionally separate from {@link RemoteConnectionService}.
 * The controller bridges the returned {@link InputStream} to a Spring MVC
 * {@link org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody}
 * so bytes are written chunk-by-chunk directly to the HTTP response without
 * buffering the full file in memory.
 *
 */
public interface RemoteStreamService {

    /**
     * Opens and returns an {@link InputStream} for the given remote file.
     *
     * <p>The caller is responsible for closing the stream. The connection
     * itself is <em>not</em> closed — it remains alive for subsequent operations.
     *
     * @param sessionId  the active session to read from
     * @param ownerId    ID of the authenticated user (ownership check)
     * @param remotePath absolute path of the file on the remote host
     * @return an open {@link InputStream} positioned at the start of the file
     */
    InputStream streamFile(String sessionId, UUID ownerId, String remotePath);
}
