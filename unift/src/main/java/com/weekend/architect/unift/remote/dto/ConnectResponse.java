package com.weekend.architect.unift.remote.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.weekend.architect.unift.remote.enums.ProtocolType;
import com.weekend.architect.unift.remote.enums.SessionState;
import java.time.OffsetDateTime;
import lombok.Builder;
import lombok.Value;

/** Response returned when a session is successfully opened or inspected. */
@Value
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ConnectResponse {

    String       sessionId;
    /** The friendly alias provided at connect-time. */
    String       label;
    ProtocolType protocol;
    String       host;
    int          port;
    String       username;
    SessionState state;
    OffsetDateTime createdAt;
    OffsetDateTime expiresAt;
    /** Home directory of the remote user; populated after successful connect. */
    String homeDirectory;
    /**
     * Detected OS or service name, e.g. "Ubuntu 22.04.3 LTS", "Amazon S3".
     * Populated after successful connect; {@code null} if detection failed.
     */
    String remoteOs;
}
