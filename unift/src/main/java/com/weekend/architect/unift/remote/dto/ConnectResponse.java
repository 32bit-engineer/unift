package com.weekend.architect.unift.remote.dto;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import com.weekend.architect.unift.remote.enums.SessionState;
import java.time.OffsetDateTime;
import lombok.Builder;
import lombok.Value;

/** Response returned when a session is successfully opened or inspected. */
@Value
@Builder
public class ConnectResponse {

    String sessionId;
    /** The friendly alias provided at connect-time. */
    String label;

    ProtocolType protocol;
    String host;
    int port;
    String username;
    SessionState state;
    OffsetDateTime createdAt;
    OffsetDateTime expiresAt;
    /** Home directory of the remote user; populated after successful connect. */
    String homeDirectory;
}
