package com.weekend.architect.unift.remote.service;

import com.weekend.architect.unift.remote.dto.SavedHostRequest;
import com.weekend.architect.unift.remote.enums.ProtocolType;

/**
 * Strategy interface for validating the credential fields of a {@link SavedHostRequest} for a
 * specific remote protocol.
 *
 * <p>Each protocol registers its own validator as a Spring bean. The service layer discovers all
 * validators via dependency injection and dispatches to the one whose {@link #supports} method
 * returns {@code true} for the requested protocol.
 *
 * <p>Adding support for a new protocol requires only a new implementation — the service class
 * itself does not need to change (Open/Closed Principle).
 *
 * @see ConnectRequestAssembler
 */
public interface CredentialValidator {

    /**
     * Returns {@code true} if this validator handles the given protocol.
     *
     * @param protocol the protocol to check
     */
    boolean supports(ProtocolType protocol);

    /**
     * Validates that all credential fields required by the protocol are present and non-blank.
     *
     * @param request the incoming save request with plaintext credentials
     * @throws com.weekend.architect.unift.remote.exception.CredentialValidationException if any
     *     required field is missing or invalid
     */
    void validate(SavedHostRequest request);
}
