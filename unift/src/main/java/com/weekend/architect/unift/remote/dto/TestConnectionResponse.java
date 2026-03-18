package com.weekend.architect.unift.remote.dto;

import lombok.Builder;
import lombok.Value;

/** Response returned when testing connection credentials. */
@Value
@Builder
public class TestConnectionResponse {

    /** true if the connection was successfully established, false otherwise. */
    boolean success;

    /** Optional message with additional details (e.g., error message or success description). */
    String message;

    /** The protocol that was tested. */
    String protocol;

    /** The host that was tested. */
    String host;

    /** The port that was tested. */
    int port;
}
