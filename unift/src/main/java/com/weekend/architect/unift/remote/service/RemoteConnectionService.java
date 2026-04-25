package com.weekend.architect.unift.remote.service;

import com.weekend.architect.unift.remote.dto.ConnectRequest;
import com.weekend.architect.unift.remote.dto.ConnectResponse;
import com.weekend.architect.unift.remote.dto.DirectoryListingResponse;
import com.weekend.architect.unift.remote.dto.TestConnectionResponse;
import com.weekend.architect.unift.remote.dto.TransferStatusResponse;
import java.io.InputStream;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * Service contract for all remote-connection operations.
 *
 * <p>All methods accept the {@code ownerId} of the currently-authenticated user so that the
 * implementation can enforce session ownership.
 */
public interface RemoteConnectionService {

    /**
     * Opens a new remote session using the supplied credentials.
     *
     * @param ownerId the authenticated user's ID
     * @param request connection parameters and credentials
     * @return session info including the session ID and expiry time
     */
    ConnectResponse openSession(UUID ownerId, ConnectRequest request);

    /**
     * Returns status information for an existing session.
     *
     * @throws com.weekend.architect.unift.remote.exception.SessionNotFoundException if not found
     * @throws com.weekend.architect.unift.remote.exception.SessionAccessDeniedException if not
     *     owned by user
     */
    ConnectResponse getSession(String sessionId, UUID ownerId);

    /**
     * Closes and removes the session, releasing all transport resources.
     *
     * @throws com.weekend.architect.unift.remote.exception.SessionNotFoundException if not found
     * @throws com.weekend.architect.unift.remote.exception.SessionAccessDeniedException if not
     *     owned by user
     */
    void closeSession(String sessionId, UUID ownerId);

    /** Returns all active sessions owned by the given user. */
    List<ConnectResponse> listSessions(UUID ownerId);

    /**
     * Returns the set of workspace types currently active for a session.
     *
     * @throws com.weekend.architect.unift.remote.exception.SessionNotFoundException if not found
     * @throws com.weekend.architect.unift.remote.exception.SessionAccessDeniedException if not owned by user
     */
    Set<String> listWorkspaces(String sessionId, UUID ownerId);

    /**
     * Activates a workspace type for a session.
     *
     * @param type workspace type to activate (ssh, docker, kubernetes)
     * @return the updated set of active workspaces
     * @throws IllegalArgumentException if the type is not a valid workspace type
     * @throws com.weekend.architect.unift.remote.exception.SessionNotFoundException if not found
     * @throws com.weekend.architect.unift.remote.exception.SessionAccessDeniedException if not owned by user
     */
    Set<String> activateWorkspace(String sessionId, UUID ownerId, String type);

    /**
     * Deactivates a workspace type for a session, evicting any associated client pools.
     * The {@code ssh} workspace cannot be deactivated.
     *
     * @param type workspace type to deactivate (docker, kubernetes)
     * @return the updated set of active workspaces
     * @throws IllegalArgumentException if the type is not valid or is "ssh"
     * @throws com.weekend.architect.unift.remote.exception.SessionNotFoundException if not found
     * @throws com.weekend.architect.unift.remote.exception.SessionAccessDeniedException if not owned by user
     */
    Set<String> deactivateWorkspace(String sessionId, UUID ownerId, String type);

    /**
     * Opens an SSE stream that pushes transfer status updates at the given interval.
     *
     * @param sessionId session whose transfers to stream
     * @param ownerId   authenticated user (ownership check)
     * @param intervalMs polling interval in milliseconds (clamped to allowed range internally)
     * @return a configured {@link SseEmitter} that the controller can return directly
     */
    SseEmitter streamTransfers(String sessionId, UUID ownerId, int intervalMs);

    /**
     * Lists all entries at the given remote path.
     *
     * @param path remote path to list; pass {@code null} to list the home directory
     */
    DirectoryListingResponse listDirectory(String sessionId, UUID ownerId, String path);

    /** Deletes a file or empty directory at the given remote path. */
    void deleteFile(String sessionId, UUID ownerId, String remotePath);

    /**
     * Renames / moves a remote file or directory.
     *
     * @param remotePath current absolute path
     * @param newPath target absolute path
     */
    void renameFile(String sessionId, UUID ownerId, String remotePath, String newPath);

    /** Creates a directory (including any missing parents) at the given path. */
    void createDirectory(String sessionId, UUID ownerId, String remotePath);

    /**
     * Streams a file from the remote host to the HTTP response.
     *
     * @param remotePath source path on the remote host
     * @return a {@link StreamingResponseBody} that pipes the remote bytes into the HTTP response
     *     output stream
     */
    StreamingResponseBody downloadFile(String sessionId, UUID ownerId, String remotePath);

    /**
     * Uploads a file to the remote host.
     *
     * @param remotePath target path on the remote host (must include filename)
     * @param file the multipart file from the HTTP request
     * @return the transfer ID for progress tracking
     */
    String uploadFile(String sessionId, UUID ownerId, String remotePath, MultipartFile file);

    /**
     * Uploads a file to the remote host by streaming raw bytes from the caller-supplied {@link
     * InputStream}. Unlike {@link #uploadFile}, this method bypasses Spring's multipart resolver
     * entirely — the data is piped directly into the SFTP channel without ever being buffered in a
     * server temp file. Use this for large files.
     *
     * <p>The caller is responsible for closing {@code inputStream}.
     *
     * @param remotePath target path on the remote host (must include filename)
     * @param inputStream raw byte stream of the file content
     * @param contentLength total byte count; pass {@code -1} if unknown
     * @return the transfer ID for progress tracking
     */
    String uploadStream(String sessionId, UUID ownerId, String remotePath, InputStream inputStream, long contentLength);

    /**
     * Cancels an in-progress stream upload, stops the data transfer, and removes any partial file
     * written to the remote host.
     *
     * <p>Cancellation is asynchronous: this method sets the cancellation signal and returns
     * immediately. The upload thread will detect the signal on its next read, abort the SFTP
     * transfer, and delete the partial remote file.
     *
     * @param sessionId the session the transfer belongs to
     * @param ownerId ID of the authenticated user (ownership check)
     * @param transferId ID of the upload transfer to cancel
     * @throws IllegalArgumentException if the transfer is not an upload or does not support
     *     cancellation
     * @throws IllegalStateException if the transfer has already completed, failed, or been canceled
     */
    void cancelTransfer(String sessionId, UUID ownerId, String transferId);

    /** Returns the status of all transfers associated with the given session. */
    List<TransferStatusResponse> getTransfers(String sessionId, UUID ownerId);

    /** Returns the status of a single transfer. */
    TransferStatusResponse getTransfer(String sessionId, UUID ownerId, String transferId);

    /**
     * Tests if the given connection credentials are valid without creating a session.
     *
     * @param request connection parameters and credentials to test
     * @return result indicating whether the connection was successful
     */
    TestConnectionResponse testConnection(ConnectRequest request);
}
