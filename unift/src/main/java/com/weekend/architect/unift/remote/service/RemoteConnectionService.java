package com.weekend.architect.unift.remote.service;

import com.weekend.architect.unift.remote.dto.ConnectRequest;
import com.weekend.architect.unift.remote.dto.ConnectResponse;
import com.weekend.architect.unift.remote.dto.DirectoryListingResponse;
import com.weekend.architect.unift.remote.dto.TransferStatusResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * Service contract for all remote-connection operations.
 *
 * <p>All methods accept the {@code ownerId} of the currently-authenticated
 * user so that the implementation can enforce session ownership.
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
     * @throws com.weekend.architect.unift.remote.exception.SessionNotFoundException  if not found
     * @throws com.weekend.architect.unift.remote.exception.SessionAccessDeniedException if not owned by user
     */
    ConnectResponse getSession(String sessionId, UUID ownerId);

    /**
     * Closes and removes the session, releasing all transport resources.
     *
     * @throws com.weekend.architect.unift.remote.exception.SessionNotFoundException  if not found
     * @throws com.weekend.architect.unift.remote.exception.SessionAccessDeniedException if not owned by user
     */
    void closeSession(String sessionId, UUID ownerId);

    /**
     * Returns all active sessions owned by the given user.
     */
    List<ConnectResponse> listSessions(UUID ownerId);

    /**
     * Lists all entries at the given remote path.
     *
     * @param path remote path to list; pass {@code null} to list the home directory
     */
    DirectoryListingResponse listDirectory(String sessionId, UUID ownerId, String path);

    /**
     * Deletes a file or empty directory at the given remote path.
     */
    void deleteFile(String sessionId, UUID ownerId, String remotePath);

    /**
     * Renames / moves a remote file or directory.
     *
     * @param remotePath current absolute path
     * @param newPath    target absolute path
     */
    void renameFile(String sessionId, UUID ownerId, String remotePath, String newPath);

    /**
     * Creates a directory (including any missing parents) at the given path.
     */
    void createDirectory(String sessionId, UUID ownerId, String remotePath);

    /**
     * Streams a file from the remote host to the HTTP response.
     *
     * @param remotePath source path on the remote host
     * @return a {@link StreamingResponseBody} that pipes the remote bytes
     *         into the HTTP response output stream
     */
    StreamingResponseBody downloadFile(String sessionId, UUID ownerId, String remotePath);

    /**
     * Uploads a file to the remote host.
     *
     * @param remotePath target path on the remote host (must include filename)
     * @param file       the multipart file from the HTTP request
     * @return the transfer ID for progress tracking
     */
    String uploadFile(String sessionId, UUID ownerId, String remotePath, MultipartFile file);

    /**
     * Returns the status of all transfers associated with the given session.
     */
    List<TransferStatusResponse> getTransfers(String sessionId, UUID ownerId);

    /**
     * Returns the status of a single transfer.
     */
    TransferStatusResponse getTransfer(String sessionId, UUID ownerId, String transferId);
}
