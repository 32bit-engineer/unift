package com.weekend.architect.unift.remote.service.impl;

import com.weekend.architect.unift.remote.analytics.SessionMetricsStore;
import com.weekend.architect.unift.remote.config.RemoteConnectionProperties;
import com.weekend.architect.unift.remote.core.CancellableInputStream;
import com.weekend.architect.unift.remote.core.CancellationToken;
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
import com.weekend.architect.unift.remote.dto.TestConnectionResponse;
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
import com.weekend.architect.unift.remote.model.TransferLog;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import com.weekend.architect.unift.remote.registry.TransferRegistry;
import com.weekend.architect.unift.remote.repository.SessionLogRepository;
import com.weekend.architect.unift.remote.repository.TransferLogRepository;
import com.weekend.architect.unift.remote.service.RemoteConnectionService;
import com.weekend.architect.unift.utils.UuidUtils;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Paths;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@Slf4j
@Service
@RequiredArgsConstructor
public class RemoteConnectionServiceImpl implements RemoteConnectionService {

    private final SessionRegistry sessionRegistry;
    private final RemoteConnectionProperties props;
    private final SessionMetricsStore metricsStore;
    private final TransferRegistry transferRegistry;
    private final ConnectionFactory connectionFactory;
    private final SessionLogRepository sessionLogRepository;
    private final TransferLogRepository transferLogRepository;

    @Override
    public ConnectResponse openSession(UUID ownerId, ConnectRequest request) {
        // 1. Build typed credentials from request
        RemoteCredentials credentials = buildCredentials(request);

        // 2. Determine TTL
        long ttl = request.getSessionTtlMinutes() > 0
                ? Math.min(request.getSessionTtlMinutes(), props.getSessionTtlMinutes())
                : props.getSessionTtlMinutes();

        // 3. Build session envelope
        String sessionId = UuidUtils.uuidVersion7().toString();
        OffsetDateTime now = OffsetDateTime.now();
        RemoteSession session = RemoteSession.builder()
                .sessionId(sessionId)
                .ownerId(ownerId)
                .savedHostId(request.getSavedHostId())
                .label(request.getLabel())
                .protocol(request.getProtocol())
                .host(request.getHost())
                .port(request.getPort())
                .username(request.getUsername())
                .createdAt(now)
                .atomicExpiresAt(new AtomicReference<>(now.plusMinutes(ttl)))
                .ttlMinutes(ttl)
                .slidingTtl(props.isSlidingTtl())
                .state(SessionState.INITIALIZING)
                .build();
        session.initActiveWorkspaces();

        // 4. Create & connect
        RemoteConnection connection = connectionFactory.create(credentials, session);
        connection.connect(credentials); // throws ConnectionException on failure

        // 5. Atomically check per-user cap and register (prevents TOCTOU race)
        if (!sessionRegistry.registerIfUnderCap(connection, ownerId, props.getMaxSessionsPerUser())) {
            try {
                connection.close();
            } catch (Exception ignored) {
            }
            throw new MaxSessionsExceededException(props.getMaxSessionsPerUser());
        }

        // 6a. Initialize per-session metrics bucket
        metricsStore.initSession(sessionId);

        // 7. Fetch home directory (best-effort)
        String homeDir = resolveHomeDirectory(connection);

        // 8. Detect remote OS / service name (best-effort)
        String remoteOs = resolveRemoteOs(connection);
        session.setRemoteOs(remoteOs);

        // 9. Persist session metadata to DB (best-effort — never rolls back the session)
        sessionLogRepository.save(session);

        log.info(
                "Session {} opened for user {} → {}:{} [{}]",
                sessionId,
                ownerId,
                request.getHost(),
                request.getPort(),
                remoteOs);
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
        Optional<RemoteConnection> maybeConn = sessionRegistry.find(sessionId);
        if (maybeConn.isEmpty()) {
            log.info("Session {} already closed or not found — no-op", sessionId);
            return;
        }
        RemoteConnection conn = maybeConn.get();
        assertOwnership(conn, ownerId);
        transferRegistry.removeBySession(sessionId);
        sessionRegistry.remove(sessionId);
        sessionLogRepository.markClosed(sessionId);
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

        // Capture session metadata before entering the lambda (session may be closed by the time
        // the streaming body is written)
        String remoteHost = conn.getSession().getHost();
        int remotePort = conn.getSession().getPort();

        // Open the remote stream now (before returning the lambda) so that any
        // immediate errors (file not found, permissions) surface as HTTP 502,
        // not as a broken streaming response.
        InputStream remoteStream = conn.download(remotePath, callback);

        return outputStream -> {
            try (remoteStream) {
                byte[] buffer = new byte[128000]; // 128KB Buffer
                int bytesRead;
                while ((bytesRead = remoteStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                    outputStream.flush();
                }
                transferRegistry.updateState(transfer.getTransferId(), TransferState.COMPLETED);
                transfer.setCompletedAt(OffsetDateTime.now());
                logTransfer(ownerId, remotePath, remoteHost, remotePort, transfer);
            } catch (IOException e) {
                transferRegistry.updateState(transfer.getTransferId(), TransferState.FAILED);
                transfer.setErrorMessage(e.getMessage());
                transfer.setCompletedAt(OffsetDateTime.now());
                logTransfer(ownerId, remotePath, remoteHost, remotePort, transfer);
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

        String remoteHost = conn.getSession().getHost();
        int remotePort = conn.getSession().getPort();

        try (InputStream source = file.getInputStream()) {
            transferRegistry.updateState(transfer.getTransferId(), TransferState.IN_PROGRESS);
            conn.upload(remotePath, source, fileSize, callback, null); // multipart uploads are not cancellable
            transferRegistry.updateState(transfer.getTransferId(), TransferState.COMPLETED);
            transfer.setCompletedAt(OffsetDateTime.now());
            log.info("[{}] Upload of '{}' complete ({} bytes)", sessionId, remotePath, fileSize);
            logTransfer(ownerId, remotePath, remoteHost, remotePort, transfer);
        } catch (IOException e) {
            transferRegistry.updateState(transfer.getTransferId(), TransferState.FAILED);
            transfer.setErrorMessage(e.getMessage());
            transfer.setCompletedAt(OffsetDateTime.now());
            logTransfer(ownerId, remotePath, remoteHost, remotePort, transfer);
            throw new TransferException("Failed to read upload stream: " + e.getMessage(), e);
        }

        return transfer.getTransferId();
    }

    @Override
    public String uploadStream(
            String sessionId, UUID ownerId, String remotePath, InputStream inputStream, long contentLength) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);

        RemoteTransfer transfer = createTransfer(sessionId, remotePath, TransferDirection.UPLOAD, contentLength);

        // Attach a cancellation token so the cancel endpoint can signal this transfer
        CancellationToken cancellationToken = new CancellationToken();
        transfer.setCancellationToken(cancellationToken);

        TransferProgressCallback callback = progressCallbackFor(transfer);

        String remoteHost = conn.getSession().getHost();
        int remotePort = conn.getSession().getPort();

        try {
            transferRegistry.updateState(transfer.getTransferId(), TransferState.IN_PROGRESS);
            // CancellableInputStream is a secondary guard (throws before each read).
            // The primary cancellation path is JschSftpProgressMonitor.count() returning false,
            // which is JSch's official way to stop the copy loop.
            conn.upload(
                    remotePath,
                    new CancellableInputStream(inputStream, cancellationToken),
                    contentLength,
                    callback,
                    cancellationToken);

            // IMPORTANT: when the monitor returns false, JSch breaks its write loop and
            // put() returns normally — it does NOT throw. We must check the token here
            // to distinguish a completed upload from a canceled one.
            if (cancellationToken.isCancelled()) {
                handleUploadCancellation(transfer, conn, sessionId, remotePath, ownerId, remoteHost, remotePort);
            } else {
                transferRegistry.updateState(transfer.getTransferId(), TransferState.COMPLETED);
                transfer.setCompletedAt(OffsetDateTime.now());
                log.info("[{}] Stream upload of '{}' complete ({} bytes)", sessionId, remotePath, contentLength);
                logTransfer(ownerId, remotePath, remoteHost, remotePort, transfer);
            }
        } catch (TransferException e) {
            // Secondary path: CancellableInputStream threw InterruptedIOException mid-read
            if (cancellationToken.isCancelled()) {
                handleUploadCancellation(transfer, conn, sessionId, remotePath, ownerId, remoteHost, remotePort);
            } else {
                transferRegistry.updateState(transfer.getTransferId(), TransferState.FAILED);
                transfer.setErrorMessage(e.getMessage());
                transfer.setCompletedAt(OffsetDateTime.now());
                logTransfer(ownerId, remotePath, remoteHost, remotePort, transfer);
                throw e;
            }
        }

        return transfer.getTransferId();
    }

    @Override
    public void cancelTransfer(String sessionId, UUID ownerId, String transferId) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, ownerId);

        RemoteTransfer transfer = transferRegistry.require(transferId);

        // Guard: transfer must belong to this session
        if (!sessionId.equals(transfer.getSessionId())) {
            throw new IllegalArgumentException("Transfer " + transferId + " does not belong to session " + sessionId);
        }
        // Guard: only uploads can be canceled
        if (transfer.getDirection() != TransferDirection.UPLOAD) {
            throw new IllegalArgumentException("Only upload transfers can be cancelled");
        }
        // Guard: must still be active
        TransferState state = transfer.getState();
        if (state == TransferState.COMPLETED || state == TransferState.FAILED || state == TransferState.CANCELLED) {
            throw new IllegalStateException("Transfer " + transferId + " has already finished (state: "
                    + state.name().toLowerCase() + ")");
        }
        // Guard: must be a cancellable stream upload (not multipart)
        CancellationToken token = transfer.getCancellationToken();
        if (token == null) {
            throw new IllegalArgumentException("Transfer " + transferId + " does not support cancellation. "
                    + "Only uploads started via POST .../files/upload/stream can be cancelled.");
        }

        log.info("[{}] Cancellation requested for transfer {}", sessionId, transferId);
        token.cancel();
        // The upload thread detects the signal on its next read, unwinds, marks the
        // transfer CANCELLED, and deletes the partial remote file automatically.
    }

    /**
     * Marks a transfer as CANCELLED and attempts to delete the partial remote file.
     * Called from both the normal-return and exception paths of {@code uploadStream}.
     */
    private void handleUploadCancellation(
            RemoteTransfer transfer,
            RemoteConnection conn,
            String sessionId,
            String remotePath,
            UUID ownerId,
            String remoteHost,
            int remotePort) {
        transferRegistry.updateState(transfer.getTransferId(), TransferState.CANCELLED);
        transfer.setCompletedAt(OffsetDateTime.now());
        transfer.setErrorMessage("Cancelled by user");
        log.info("[{}] Upload of '{}' was cancelled; removing partial file", sessionId, remotePath);
        tryDeletePartialFile(conn, sessionId, remotePath);
        logTransfer(ownerId, remotePath, remoteHost, remotePort, transfer);
    }

    /**
     * Best-effort deletion of a partial remote file left behind by a canceled upload.
     * Logs a warning on failure but never throws.
     */
    private void tryDeletePartialFile(RemoteConnection conn, String sessionId, String remotePath) {
        try {
            conn.delete(remotePath);
            log.info("[{}] Partial file '{}' removed after cancellation", sessionId, remotePath);
        } catch (Exception e) {
            log.warn(
                    "[{}] Could not remove partial file '{}' after cancellation: {}",
                    sessionId,
                    remotePath,
                    e.getMessage());
        }
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

    @Override
    public TestConnectionResponse testConnection(ConnectRequest request) {
        log.info(
                "Testing connection for user {} → {}:{} ({})",
                request.getUsername(),
                request.getHost(),
                request.getPort(),
                request.getProtocol());

        try {
            // Build typed credentials from request
            RemoteCredentials credentials = buildCredentials(request);

            // Create a temporary session for connection testing
            String sessionId = UuidUtils.uuidVersion7().toString();
            OffsetDateTime now = OffsetDateTime.now();
            RemoteSession session = RemoteSession.builder()
                    .sessionId(sessionId)
                    .ownerId(UUID.randomUUID()) // temporary owner for test
                    .label(request.getLabel())
                    .protocol(request.getProtocol())
                    .host(request.getHost())
                    .port(request.getPort())
                    .username(request.getUsername())
                    .createdAt(now)
                    .atomicExpiresAt(new AtomicReference<>(now.plusMinutes(1)))
                    .ttlMinutes(1L)
                    .slidingTtl(props.isSlidingTtl())
                    .state(SessionState.INITIALIZING)
                    .build();
            session.initActiveWorkspaces();

            // Create & connect
            RemoteConnection connection = connectionFactory.create(credentials, session);
            connection.connect(credentials); // throws ConnectionException on failure

            // Test succeeded - extract result before closing
            String protocolName = request.getProtocol().toString();
            TestConnectionResponse successResponse = TestConnectionResponse.builder()
                    .success(true)
                    .message("Connection successful to " + request.getHost() + ":" + request.getPort())
                    .protocol(protocolName)
                    .host(request.getHost())
                    .port(request.getPort())
                    .build();

            // Clean up: close the connection immediately
            connection.close();

            log.info("Connection test successful for {}:{} ({})", request.getHost(), request.getPort(), protocolName);
            return successResponse;

        } catch (Exception e) {
            log.warn(
                    "Connection test failed for {}:{} ({}) - {}",
                    request.getHost(),
                    request.getPort(),
                    request.getProtocol(),
                    e.getMessage());

            return TestConnectionResponse.builder()
                    .success(false)
                    .message("Connection failed: " + e.getMessage())
                    .protocol(request.getProtocol().toString())
                    .host(request.getHost())
                    .port(request.getPort())
                    .build();
        }
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

    /**
     * Calls {@link RemoteConnection#detectRemoteOs()} and returns the result.
     * Never throws — any error is logged as a warning and {@code null} is returned.
     */
    private String resolveRemoteOs(RemoteConnection conn) {
        try {
            return conn.detectRemoteOs();
        } catch (Exception e) {
            log.warn("[{}] Could not detect remote OS: {}", conn.getSessionId(), e.getMessage());
            return null;
        }
    }

    /**
     * Best-effort: writes a {@link TransferLog} row for a terminal transfer.
     * Never throws — a logging failure must never affect the API response.
     *
     * @param ownerId    the authenticated user's ID
     * @param remotePath remote file path (used to derive filename, source and destination)
     * @param remoteHost hostname of the remote server
     * @param remotePort port of the remote server
     * @param transfer   the completed/failed/cancelled transfer
     */
    private void logTransfer(
            UUID ownerId, String remotePath, String remoteHost, int remotePort, RemoteTransfer transfer) {
        try {
            // Extract just the filename from the remote path
            java.nio.file.Path p = Paths.get(remotePath);
            String filename = p.getFileName() != null ? p.getFileName().toString() : remotePath;

            // source / destination from the perspective of data flow
            String remoteAddr = remoteHost + ":" + remotePort + remotePath;
            boolean isUpload = transfer.getDirection() == TransferDirection.UPLOAD;
            String source = isUpload ? "client" : remoteAddr;
            String destination = isUpload ? remoteAddr : "client";

            // Duration and throughput
            Long durationMs = null;
            Long avgSpeedBps = null;
            if (transfer.getStartedAt() != null && transfer.getCompletedAt() != null) {
                durationMs = java.time.Duration.between(transfer.getStartedAt(), transfer.getCompletedAt())
                        .toMillis();
                long bytes = transfer.getBytesTransferred().get();
                if (durationMs > 0 && bytes > 0) {
                    avgSpeedBps = (bytes * 1000L) / durationMs;
                }
            }

            TransferLog entry = TransferLog.builder()
                    .id(UuidUtils.uuidVersion7())
                    .userId(ownerId)
                    .filename(filename)
                    .source(source)
                    .destination(destination)
                    .sizeBytes(transfer.getBytesTransferred().get())
                    .avgSpeedBps(avgSpeedBps)
                    .durationMs(durationMs)
                    .status(transfer.getState().name())
                    .errorMessage(transfer.getErrorMessage())
                    .build();

            transferLogRepository.save(entry);
            log.debug("[transfer-log] Logged {} transfer for user {} → {}", transfer.getState(), ownerId, filename);
        } catch (Exception e) {
            log.warn("[transfer-log] Failed to persist transfer log entry: {}", e.getMessage());
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
        AtomicLong prevTransferred = new AtomicLong(0L);
        return (transferred, total) -> {
            transfer.getBytesTransferred().set(transferred);
            if (transfer.getState() == TransferState.PENDING) {
                transferRegistry.updateState(transfer.getTransferId(), TransferState.IN_PROGRESS);
            }
            // Track bandwidth delta in the metrics store
            long delta = transferred - prevTransferred.getAndSet(transferred);
            if (delta > 0) {
                if (transfer.getDirection() == TransferDirection.UPLOAD) {
                    metricsStore.addUploadBytes(transfer.getSessionId(), delta);
                } else {
                    metricsStore.addDownloadBytes(transfer.getSessionId(), delta);
                }
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
                .remoteOs(s.getRemoteOs())
                .activeWorkspaces(s.getActiveWorkspaces())
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
