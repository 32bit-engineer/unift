package com.weekend.architect.unift.remote.docker;

import com.weekend.architect.unift.remote.exception.RemoteConnectionException;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Validates Docker-related request parameters and DTOs before they reach the service layer.
 *
 * <p>All validation methods throw {@link RemoteConnectionException} or
 * {@link IllegalArgumentException} with descriptive messages.
 */
@Component
public class DockerRequestValidator {

    private static final int MIN_STREAM_INTERVAL_MS = 1000;
    private static final int MAX_STREAM_INTERVAL_MS = 60000;

    /** Validates that the session ID is not null or blank. */
    public void validateSessionId(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("Session ID must not be blank");
        }
    }

    /** Validates that the user ID is not null. */
    public void validateUserId(UUID userId) {
        if (userId == null) {
            throw new IllegalArgumentException("User ID must not be null");
        }
    }

    /** Validates container ID or name format. */
    public void validateContainerId(String containerId) {
        if (containerId == null || containerId.isBlank()) {
            throw new IllegalArgumentException("Container ID must not be blank");
        }
        if (!containerId.matches("^[a-fA-F0-9]{12,64}$") && !containerId.matches("^[a-zA-Z][a-zA-Z0-9_.-]+$")) {
            throw new IllegalArgumentException("Invalid container ID or name format");
        }
    }

    /** Validates image name format (repo:tag or repo@digest). */
    public void validateImageReference(String image) {
        if (image == null || image.isBlank()) {
            throw new IllegalArgumentException("Image reference must not be blank");
        }
        if (!image.matches("^[a-zA-Z0-9][a-zA-Z0-9._/-]*(:[a-zA-Z0-9._-]+)?(@sha256:[a-fA-F0-9]{64})?$")) {
            throw new IllegalArgumentException("Invalid image reference format");
        }
    }

    /** Validates container name format. */
    public void validateContainerName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Container name must not be blank");
        }
        if (!name.matches("^/?[a-zA-Z0-9][a-zA-Z0-9_.-]+$")) {
            throw new IllegalArgumentException("Invalid container name format");
        }
    }

    /** Validates and clamps the SSE stream interval to the allowed range. */
    public int validateAndClampInterval(int intervalMs) {
        return Math.max(MIN_STREAM_INTERVAL_MS, Math.min(MAX_STREAM_INTERVAL_MS, intervalMs));
    }

    /** Validates the {@link DockerModels.PullImageRequest} DTO fields. */
    public void validatePullImageRequest(DockerModels.PullImageRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Pull image request must not be null");
        }
        validateImageReference(request.getRepository());
    }

    /** Validates the {@link DockerModels.CreateNetworkRequest} DTO fields. */
    public void validateCreateNetworkRequest(DockerModels.CreateNetworkRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Create network request must not be null");
        }
        if (request.getName() == null || request.getName().isBlank()) {
            throw new IllegalArgumentException("Network name must not be blank");
        }
    }

    /** Validates the {@link DockerModels.CreateVolumeRequest} DTO fields. */
    public void validateCreateVolumeRequest(DockerModels.CreateVolumeRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Create volume request must not be null");
        }
        if (request.getName() == null || request.getName().isBlank()) {
            throw new IllegalArgumentException("Volume name must not be blank");
        }
    }

    /** Validates the {@link DockerModels.ComposeFileRequest} DTO fields. */
    public void validateComposeFileRequest(DockerModels.ComposeFileRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Compose file request must not be null");
        }
        if (request.getServices() == null || request.getServices().isEmpty()) {
            throw new IllegalArgumentException("At least one service definition is required");
        }
        for (var svc : request.getServices()) {
            if (svc.getName() == null || svc.getName().isBlank()) {
                throw new IllegalArgumentException("Service name must not be blank");
            }
            if (svc.getImage() == null || svc.getImage().isBlank()) {
                throw new IllegalArgumentException("Service image must not be blank for service: " + svc.getName());
            }
        }
    }
}
