package com.weekend.architect.unift.remote.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.weekend.architect.unift.remote.enums.ProtocolType;
import com.weekend.architect.unift.remote.enums.SshAuthType;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Builder;
import lombok.Value;

/**
 * Response DTO for a saved remote host configuration.
 *
 * <p>Credential fields are <strong>never</strong> included — not even their encrypted form.
 * The {@code protocol} field indicates the connection type and {@code authType} conveys
 * which SSH credential type is stored (SSH only; {@code null} for other protocols).
 *
 * <p>{@code activeSessionId} is populated when at least one active session currently exists
 * for this saved host.  {@code activeSessionInitiatedBy} holds the ID of the user who
 * opened that session, which may differ from the requesting user when the host is shared.
 */
@Value
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SavedHostResponse {

    UUID id;
    String label;
    ProtocolType protocol;
    String hostname;
    int port;
    String username;
    SshAuthType authType;
    boolean strictHostKeyChecking;
    String expectedFingerprint;
    OffsetDateTime createdAt;
    OffsetDateTime lastUsed;

    /**
     * User's preferred workspace type for this host.
     * Values: {@code ssh}, {@code docker}, {@code kubernetes}. Defaults to {@code ssh}.
     */
    String workspacePreference;

    /** ID of the active session for this host, or {@code null} if no session is open. */
    String activeSessionId;

    /**
     * ID of the user who initiated the active session, or {@code null} if no session
     * is open.  Lets callers verify whether they (or someone else) opened the session.
     */
    UUID activeSessionInitiatedBy;
}
