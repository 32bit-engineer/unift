package com.weekend.architect.unift.remote.service.impl;

import com.weekend.architect.unift.remote.dto.ConnectRequest;
import com.weekend.architect.unift.remote.dto.ConnectResponse;
import com.weekend.architect.unift.remote.dto.SavedHostRequest;
import com.weekend.architect.unift.remote.dto.SavedHostResponse;
import com.weekend.architect.unift.remote.enums.ProtocolType;
import com.weekend.architect.unift.remote.exception.SavedHostNotFoundException;
import com.weekend.architect.unift.remote.model.SavedHost;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import com.weekend.architect.unift.remote.repository.SavedHostRepository;
import com.weekend.architect.unift.remote.service.ConnectRequestAssembler;
import com.weekend.architect.unift.remote.service.CredentialValidator;
import com.weekend.architect.unift.remote.service.RemoteConnectionService;
import com.weekend.architect.unift.remote.service.SavedHostService;
import com.weekend.architect.unift.security.CredentialEncryptionService;
import com.weekend.architect.unift.utils.UuidUtils;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Protocol-agnostic implementation of {@link SavedHostService}.
 *
 * <p>Credential validation and {@link ConnectRequest} assembly are fully delegated to
 * protocol-specific strategy beans ({@link CredentialValidator} / {@link ConnectRequestAssembler}).
 * Adding support for a new protocol (e.g. FTP, S3) requires only:
 *
 * <ol>
 *   <li>A new {@link CredentialValidator} implementation annotated with {@code @Component}.
 *   <li>A new {@link ConnectRequestAssembler} implementation annotated with {@code @Component}.
 * </ol>
 *
 * No changes to this class are needed (Open/Closed Principle).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SavedHostServiceImpl implements SavedHostService {

    private final SavedHostRepository hostRepo;
    private final CredentialEncryptionService encryption;
    private final RemoteConnectionService connectionService;
    private final SessionRegistry sessionRegistry;

    /** All protocol-specific credential validators discovered via Spring DI. */
    private final List<CredentialValidator> credentialValidators;

    /** All protocol-specific ConnectRequest assemblers discovered via Spring DI. */
    private final List<ConnectRequestAssembler> connectRequestAssemblers;

    @Override
    public SavedHostResponse save(UUID ownerId, SavedHostRequest req) {
        // Delegate validation to the matching protocol strategy
        findValidator(req.getProtocol()).validate(req);

        SavedHost host = SavedHost.builder()
                .id(UuidUtils.uuidVersion7())
                .userId(ownerId)
                .label(req.getLabel())
                .protocol(req.getProtocol())
                .hostname(req.getHostname())
                .port(req.getPort())
                .username(req.getUsername())
                .authType(req.getAuthType())
                // Encrypt every credential field — nulls are passed through as null
                .encryptedPassword(encryption.encrypt(req.getPassword()))
                .encryptedPrivateKey(encryption.encrypt(req.getPrivateKey()))
                .encryptedPassphrase(encryption.encrypt(req.getPassphrase()))
                .strictHostKeyChecking(req.isStrictHostKeyChecking())
                .expectedFingerprint(req.getExpectedFingerprint())
                .build();

        hostRepo.save(host);
        log.info(
                "Saved host config [{}] ({}/{}) for user {}",
                host.getId(),
                host.getProtocol(),
                host.getHostname(),
                ownerId);
        return toResponse(host);
    }

    @Override
    public List<SavedHostResponse> list(UUID ownerId) {
        return hostRepo.findByUserId(ownerId).stream().map(this::toResponse).toList();
    }

    @Override
    public SavedHostResponse get(UUID ownerId, UUID hostId) {
        return toResponse(requireOwned(ownerId, hostId));
    }

    @Override
    public void delete(UUID ownerId, UUID hostId) {
        boolean deleted = hostRepo.deleteById(hostId, ownerId);
        if (!deleted) {
            throw new SavedHostNotFoundException(hostId);
        }
        log.info("Deleted saved host [{}] for user {}", hostId, ownerId);
    }

    @Override
    public ConnectResponse connect(UUID ownerId, UUID hostId) {
        SavedHost host = requireOwned(ownerId, hostId);

        // Decrypt credentials on the fly — plaintext exists only for this call's
        // duration
        ConnectRequest connectReq = findAssembler(host.getProtocol())
                .assemble(
                        host,
                        encryption.decrypt(host.getEncryptedPassword()),
                        encryption.decrypt(host.getEncryptedPrivateKey()),
                        encryption.decrypt(host.getEncryptedPassphrase()));

        ConnectResponse response = connectionService.openSession(ownerId, connectReq);

        // Update last_used best-effort — a failure here must not roll back the session
        try {
            hostRepo.touchLastUsed(hostId);
        } catch (Exception e) {
            log.warn("Failed to update last_used for saved host [{}]: {}", hostId, e.getMessage());
        }

        log.info(
                "Opened session {} from saved host [{}] ({}) for user {}",
                response.getSessionId(),
                hostId,
                host.getProtocol(),
                ownerId);
        return response;
    }

    @Override
    public void updateWorkspacePreference(UUID ownerId, UUID hostId, String preference) {
        requireOwned(ownerId, hostId);
        boolean updated = hostRepo.updateWorkspacePreference(hostId, ownerId, preference);
        if (!updated) {
            throw new SavedHostNotFoundException(hostId);
        }
        log.info("Updated workspace preference for host [{}] to '{}' (user {})", hostId, preference, ownerId);
    }

    /**
     * Finds the {@link CredentialValidator} that supports the given protocol.
     *
     * @throws UnsupportedOperationException if no validator is registered for the protocol
     */
    private CredentialValidator findValidator(ProtocolType protocol) {
        return credentialValidators.stream()
                .filter(v -> v.supports(protocol))
                .findFirst()
                .orElseThrow(() -> new UnsupportedOperationException(
                        "No CredentialValidator registered for protocol: " + protocol));
    }

    /**
     * Finds the {@link ConnectRequestAssembler} that supports the given protocol.
     *
     * @throws UnsupportedOperationException if no assembler is registered for the protocol
     */
    private ConnectRequestAssembler findAssembler(ProtocolType protocol) {
        return connectRequestAssemblers.stream()
                .filter(a -> a.supports(protocol))
                .findFirst()
                .orElseThrow(() -> new UnsupportedOperationException(
                        "No ConnectRequestAssembler registered for protocol: " + protocol));
    }

    /**
     * Loads the saved host and verifies ownership in one step. Throws {@link
     * SavedHostNotFoundException} if not found OR owned by a different user, deliberately
     * indistinguishable to avoid information leakage.
     */
    private SavedHost requireOwned(UUID ownerId, UUID hostId) {
        return hostRepo.findById(hostId)
                .filter(h -> ownerId.equals(h.getUserId()))
                .orElseThrow(() -> new SavedHostNotFoundException(hostId));
    }

    private SavedHostResponse toResponse(SavedHost h) {
        // Look up any currently-active session that was opened from this saved host
        var activeSession = sessionRegistry.findBySavedHostId(h.getId()).map(conn -> conn.getSession());

        return SavedHostResponse.builder()
                .id(h.getId())
                .label(h.getLabel())
                .protocol(h.getProtocol())
                .hostname(h.getHostname())
                .port(h.getPort())
                .username(h.getUsername())
                .authType(h.getAuthType())
                .strictHostKeyChecking(h.isStrictHostKeyChecking())
                .expectedFingerprint(h.getExpectedFingerprint())
                .createdAt(h.getCreatedAt())
                .lastUsed(h.getLastUsed())
                .workspacePreference(h.getWorkspacePreference())
                .activeSessionId(activeSession.map(s -> s.getSessionId()).orElse(null))
                .activeSessionInitiatedBy(activeSession.map(s -> s.getOwnerId()).orElse(null))
                .build();
    }
}
