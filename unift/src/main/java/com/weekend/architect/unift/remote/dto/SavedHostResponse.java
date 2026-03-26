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
}
