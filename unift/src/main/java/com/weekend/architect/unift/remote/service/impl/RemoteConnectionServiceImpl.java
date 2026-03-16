package com.weekend.architect.unift.remote.service.impl;

import com.weekend.architect.unift.remote.config.RemoteConnectionProperties;
import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.core.TransferProgressCallback;
import com.weekend.architect.unift.remote.credentials.RemoteCredentials;
import com.weekend.architect.unift.remote.credentials.SshKeyCredentials;
import com.weekend.architect.unift.remote.credentials.SshKeyPassphraseCredentials;
import com.weekend.architect.unift.remote.credentials.SshPasswordCredentials;
import com.weekend.architect.unift.remote.dto.ConnectRequest;
import com.weekend.architect.unift.remote.dto.ConnectResponse;
import com.weekend.architect.unift.remote.dto.DirectoryListingResponse;
import com.weekend.architect.unift.remote.dto.RemoteFileDto;
import com.weekend.architect.unift.remote.dto.TransferStatusResponse;
import com.weekend.architect.unift.remote.enums.ProtocolType;
import com.weekend.architect.unift.remote.enums.SessionState;
import com.weekend.architect.unift.remote.enums.TransferDirection;
import com.weekend.architect.unift.remote.enums.TransferState;
import com.weekend.architect.unift.remote.exception.CredentialValidationException;
import com.weekend.architect.unift.remote.exception.MaxSessionsExceededException;
import com.weekend.architect.unift.remote.exception.SessionAccessDeniedException;
import com.weekend.architect.unift.remote.exception.TransferException;
import com.weekend.architect.unift.remote.factory.ConnectionFactory;
import com.weekend.architect.unift.remote.model.RemoteFile;
import com.weekend.architect.unift.remote.model.RemoteSession;
import com.weekend.architect.unift.remote.model.RemoteTransfer;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import com.weekend.architect.unift.remote.registry.TransferRegistry;
import com.weekend.architect.unift.remote.service.RemoteConnectionService;
import com.weekend.architect.unift.utils.UuidUtils;
import java.io.IOException;
import java.io.InputStream;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@Slf4j
@Service
@RequiredArgsConstructor
public class RemoteConnectionServiceImpl implements RemoteConnectionService {

    private final ConnectionFactory connectionFactory;
    private final SessionRegistry sessionRegistry;
    private final TransferRegistry transferRegistry;
    private final RemoteConnectionProperties props;

    @Override
    public ConnectResponse openSession(UUID ownerId, ConnectRequest request) {
        // 1. Enforce per-user session cap
        int activeSessions = sessionRegistry.getByOwner(ownerId).size();
        if (activeSessions >= props.getMaxSessionsPerUser()) {
            throw new MaxSessionsExceededException(props.getMaxSessionsPerUser());
        }

        // 2. Build typed credentials from request
        RemoteCredentials credentials = buildCredentials(request);

        // 3. Determine TTL
        long ttl = request.getSessionTtlMinutes() > 0
                ? Math.min(request.getSessionTtlMinutes(), props.getSessionTtlMinutes())
                : props.getSessionTtlMinutes();

        // 4. Build session envelope
        String sessionId = UuidUtils.uuidVersion7().toString();
        OffsetDateTime now = OffsetDateTime.now();
        RemoteSession session = RemoteSession.builder()
                .sessionId(sessionId)
                .ownerId(ownerId)
                .label(request.getLabel())
                .protocol(request.getProtocol())
                .host(request.getHost())
                .port(request.getPort())
                .username(request.getUsername())
                .createdAt(now)
                .expiresAt(now.plusMinutes(ttl))
                .ttlMinutes(ttl)
                .slidingTtl(props.isSlidingTtl())
                .state(SessionState.INITIALIZING)
                .build();

        // 5. Create & connect
        RemoteConnection connection = connectionFactory.create(credentials, session);
        connection.connect(credentials); // throws ConnectionException on failure

        // 6. Register
        sessionRegistry.register(connection);

        // 7. Fetch home directory (best-effort)
        String homeDir = resolveHomeDirectory(connection);

        log.info("Session {} opened for user {} → {}:{}", sessionId, ownerId, request.getHost(), request.getPort());
        return toConnectResponse(connection, homeDir);
    }

    @Override
    public ConnectResponse getSession(String sessionId, UUID ownerId) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);
        return toConnectResponse(conn, null);
    }

    @Override
    public void closeSession(String sessionId, UUID ownerId) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);
        transferRegistry.removeBySession(sessionId);
        sessionRegistry.remove(sessionId);
        log.info("Session {} closed by user {}", sessionId, ownerId);
    }

    @Override
    public List<ConnectResponse> listSessions(UUID ownerId) {
        return sessionRegistry.getByOwner(ownerId).stream()
                .map(c -> toConnectResponse(c, null))
                .toList();
    }

    @Override
    public DirectoryListingResponse listDirectory(String sessionId, UUID ownerId, String path) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);

        String targetPath = (path != null && !path.isBlank()) ? path : conn.homeDirectory();

        List<RemoteFile> files = conn.list(targetPath);
        List<RemoteFileDto> dtos = files.stream().map(this::toFileDto).toList();

        return DirectoryListingResponse.builder()
                .path(targetPath)
                .entries(dtos)
                .totalEntries(dtos.size())
                .build();
    }

    @Override
    public void deleteFile(String sessionId, UUID ownerId, String remotePath) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);
        conn.delete(remotePath);
    }

    @Override
    public void renameFile(String sessionId, UUID ownerId, String remotePath, String newPath) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);
        conn.rename(remotePath, newPath);
    }

    @Override
    public void createDirectory(String sessionId, UUID ownerId, String remotePath) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);
        conn.mkdir(remotePath);
    }

    @Override
    public StreamingResponseBody downloadFile(String sessionId, UUID ownerId, String remotePath) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);

        // Register the transfer record
        RemoteTransfer transfer = createTransfer(sessionId, remotePath, TransferDirection.DOWNLOAD, -1L);
        TransferProgressCallback callback = progressCallbackFor(transfer);

        // Open the remote stream now (before returning the lambda) so that any
        // immediate errors (file not found, permissions) surface as HTTP 502,
        // not as a broken streaming response.
        InputStream remoteStream = conn.download(remotePath, callback);

        return outputStream -> {
            try (remoteStream) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = remoteStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                    outputStream.flush();
                }
                transferRegistry.updateState(transfer.getTransferId(), TransferState.COMPLETED);
                transfer.setCompletedAt(OffsetDateTime.now());
            } catch (IOException e) {
                transferRegistry.updateState(transfer.getTransferId(), TransferState.FAILED);
                transfer.setErrorMessage(e.getMessage());
                log.error("[{}] Download of '{}' failed: {}", sessionId, remotePath, e.getMessage());
                throw new TransferException("Download stream interrupted: " + e.getMessage(), e);
            }
        };
    }

    @Override
    public String uploadFile(String sessionId, UUID ownerId, String remotePath, MultipartFile file) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);

        long fileSize = file.getSize();
        RemoteTransfer transfer = createTransfer(sessionId, remotePath, TransferDirection.UPLOAD, fileSize);
        TransferProgressCallback callback = progressCallbackFor(transfer);

        try (InputStream source = file.getInputStream()) {
            transferRegistry.updateState(transfer.getTransferId(), TransferState.IN_PROGRESS);
            conn.upload(remotePath, source, fileSize, callback);
            transferRegistry.updateState(transfer.getTransferId(), TransferState.COMPLETED);
            transfer.setCompletedAt(OffsetDateTime.now());
            log.info("[{}] Upload of '{}' complete ({} bytes)", sessionId, remotePath, fileSize);
        } catch (IOException e) {
            transferRegistry.updateState(transfer.getTransferId(), TransferState.FAILED);
            transfer.setErrorMessage(e.getMessage());
            throw new TransferException("Failed to read upload stream: " + e.getMessage(), e);
        }

        return transfer.getTransferId();
    }

    @Override
    public List<TransferStatusResponse> getTransfers(String sessionId, UUID ownerId) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);
        return transferRegistry.getBySession(sessionId).stream()
                .map(this::toTransferResponse)
                .toList();
    }

    @Override
    public TransferStatusResponse getTransfer(String sessionId, UUID ownerId, String transferId) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);
        RemoteTransfer transfer = transferRegistry.require(transferId);
        return toTransferResponse(transfer);
    }

    private RemoteCredentials buildCredentials(ConnectRequest req) {
        if (req.getProtocol() == ProtocolType.SSH_SFTP) {
            if (req.getSshAuthType() == null) {
                throw new CredentialValidationException("sshAuthType is required for SSH_SFTP protocol");
            }
            return switch (req.getSshAuthType()) {
                case PASSWORD -> {
                    if (req.getPassword() == null || req.getPassword().isBlank()) {
                        throw new CredentialValidationException("password is required when sshAuthType=PASSWORD");
                    }
                    yield SshPasswordCredentials.builder()
                            .host(req.getHost())
                            .port(req.getPort())
                            .username(req.getUsername())
                            .password(req.getPassword())
                            .strictHostKeyChecking(req.isStrictHostKeyChecking())
                            .expectedFingerprint(req.getExpectedFingerprint())
                            .build();
                }
                case PRIVATE_KEY -> {
                    if (req.getPrivateKey() == null || req.getPrivateKey().isBlank()) {
                        throw new CredentialValidationException("privateKey is required when sshAuthType=PRIVATE_KEY");
                    }
                    yield SshKeyCredentials.builder()
                            .host(req.getHost())
                            .port(req.getPort())
                            .username(req.getUsername())
                            .privateKeyPem(req.getPrivateKey())
                            .strictHostKeyChecking(req.isStrictHostKeyChecking())
                            .expectedFingerprint(req.getExpectedFingerprint())
                            .build();
                }
                case PRIVATE_KEY_PASSPHRASE -> {
                    if (req.getPrivateKey() == null || req.getPrivateKey().isBlank()) {
                        throw new CredentialValidationException(
                                "privateKey is required when sshAuthType=PRIVATE_KEY_PASSPHRASE");
                    }
                    if (req.getPassphrase() == null || req.getPassphrase().isBlank()) {
                        throw new CredentialValidationException(
                                "passphrase is required when sshAuthType=PRIVATE_KEY_PASSPHRASE");
                    }
                    yield SshKeyPassphraseCredentials.builder()
                            .host(req.getHost())
                            .port(req.getPort())
                            .username(req.getUsername())
                            .privateKeyPem(req.getPrivateKey())
                            .passphrase(req.getPassphrase())
                            .strictHostKeyChecking(req.isStrictHostKeyChecking())
                            .expectedFingerprint(req.getExpectedFingerprint())
                            .build();
                }
            };
        }
        throw new CredentialValidationException("Protocol " + req.getProtocol() + " is not yet supported");
    }

    private void assertOwnership(RemoteConnection conn, UUID requestingUser) {
        if (!requestingUser.equals(conn.getSession().getOwnerId())) {
            throw new SessionAccessDeniedException(conn.getSessionId());
        }
    }

    private String resolveHomeDirectory(RemoteConnection conn) {
        try {
            return conn.homeDirectory();
        } catch (Exception e) {
            log.warn("[{}] Could not resolve home directory: {}", conn.getSessionId(), e.getMessage());
            return null;
        }
    }

    private RemoteTransfer createTransfer(
            String sessionId, String remotePath, TransferDirection direction, long totalBytes) {
        String transferId = UuidUtils.uuidVersion7().toString();
        RemoteTransfer transfer = RemoteTransfer.builder()
                .transferId(transferId)
                .sessionId(sessionId)
                .direction(direction)
                .remotePath(remotePath)
                .totalBytes(totalBytes)
                .state(TransferState.PENDING)
                .startedAt(OffsetDateTime.now())
                .build();
        transferRegistry.register(transfer);
        return transfer;
    }

    private TransferProgressCallback progressCallbackFor(RemoteTransfer transfer) {
        return (transferred, totalBytes) -> {
            transfer.getBytesTransferred().set(transferred);
            if (transfer.getState() == TransferState.PENDING) {
                transferRegistry.updateState(transfer.getTransferId(), TransferState.IN_PROGRESS);
            }
        };
    }

    private ConnectResponse toConnectResponse(RemoteConnection conn, String homeDir) {
        RemoteSession s = conn.getSession();
        return ConnectResponse.builder()
                .sessionId(s.getSessionId())
                .label(s.getLabel())
                .protocol(s.getProtocol())
                .host(s.getHost())
                .port(s.getPort())
                .username(s.getUsername())
                .state(s.getState())
                .createdAt(s.getCreatedAt())
                .expiresAt(s.getExpiresAt())
                .homeDirectory(homeDir)
                .build();
    }

    private RemoteFileDto toFileDto(RemoteFile f) {
        return RemoteFileDto.builder()
                .name(f.getName())
                .path(f.getPath())
                .type(f.getType())
                .sizeBytes(f.getSizeBytes())
                .lastModified(f.getLastModified())
                .permissions(f.getPermissions())
                .owner(f.getOwner())
                .hidden(f.isHidden())
                .build();
    }

    private TransferStatusResponse toTransferResponse(RemoteTransfer t) {
        return TransferStatusResponse.builder()
                .transferId(t.getTransferId())
                .sessionId(t.getSessionId())
                .direction(t.getDirection())
                .state(t.getState())
                .remotePath(t.getRemotePath())
                .totalBytes(t.getTotalBytes())
                .bytesTransferred(t.getBytesTransferred().get())
                .progressPercent(t.progressPercent())
                .startedAt(t.getStartedAt())
                .completedAt(t.getCompletedAt())
                .errorMessage(t.getErrorMessage())
                .build();
    }
}
