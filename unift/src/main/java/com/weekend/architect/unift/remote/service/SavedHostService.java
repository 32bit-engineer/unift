package com.weekend.architect.unift.remote.service;

import com.weekend.architect.unift.remote.dto.ConnectResponse;
import com.weekend.architect.unift.remote.dto.SavedHostRequest;
import com.weekend.architect.unift.remote.dto.SavedHostResponse;
import java.util.List;
import java.util.UUID;

/**
 * Service contract for managing saved remote host configurations.
 *
 * <p>Supports any {@link com.weekend.architect.unift.remote.enums.ProtocolType} — SSH/SFTP, FTP,
 * S3, Azure Blob, GCS, etc. All credential fields are encrypted before persistence and decrypted
 * only at connect time — they never appear in any response DTO.
 */
public interface SavedHostService {

    /**
     * Saves a new remote host configuration, encrypting all credential fields with AES-256-GCM
     * before writing to the database.
     *
     * @param ownerId the authenticated user's ID
     * @param request host configuration with plaintext credentials
     * @return the persisted host metadata (no credentials)
     * @throws com.weekend.architect.unift.remote.exception.CredentialValidationException if
     *     required credentials are missing for the given {@code protocol} / {@code authType}
     */
    SavedHostResponse save(UUID ownerId, SavedHostRequest request);

    /**
     * Returns all saved hosts belonging to the given user, newest first. Credentials are never
     * included in the response.
     */
    List<SavedHostResponse> list(UUID ownerId);

    /**
     * Returns a single saved host.
     *
     * @throws com.weekend.architect.unift.remote.exception.SavedHostNotFoundException if not found
     *     or not owned by {@code ownerId}
     */
    SavedHostResponse get(UUID ownerId, UUID hostId);

    /**
     * Permanently removes a saved host.
     *
     * @throws com.weekend.architect.unift.remote.exception.SavedHostNotFoundException if not found
     *     or not owned by {@code ownerId}
     */
    void delete(UUID ownerId, UUID hostId);

    /**
     * Decrypts the stored credentials on the fly and opens a new remote session for the host's
     * configured protocol. Updates {@code last_used} on success.
     *
     * @return session info (same shape as {@code POST /api/remote/sessions})
     * @throws com.weekend.architect.unift.remote.exception.SavedHostNotFoundException if not found
     *     or not owned by {@code ownerId}
     * @throws com.weekend.architect.unift.remote.exception.ConnectionException if the remote
     *     connection itself fails
     */
    ConnectResponse connect(UUID ownerId, UUID hostId);

    /**
     * Updates the workspace preference for a saved host. Valid values: {@code ssh}, {@code
     * kubernetes}.
     *
     * @throws com.weekend.architect.unift.remote.exception.SavedHostNotFoundException if not found
     *     or not owned by {@code ownerId}
     */
    void updateWorkspacePreference(UUID ownerId, UUID hostId, String preference);
}
