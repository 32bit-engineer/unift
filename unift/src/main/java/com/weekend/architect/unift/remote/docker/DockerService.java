package com.weekend.architect.unift.remote.docker;

import com.weekend.architect.unift.remote.docker.DockerModels.ContainerActionResult;
import com.weekend.architect.unift.remote.docker.DockerModels.ContainerPage;
import com.weekend.architect.unift.remote.docker.DockerModels.ContainerStats;
import com.weekend.architect.unift.remote.docker.DockerModels.DockerInfo;
import com.weekend.architect.unift.remote.docker.DockerModels.DockerOverview;
import com.weekend.architect.unift.remote.docker.DockerModels.ImagePage;
import java.util.List;
import java.util.UUID;

/**
 * Service contract for Docker management via SSH exec.
 * All operations are executed on the remote host through
 * the Docker CLI over the session's SSH connection.
 */
public interface DockerService {

    /**
     * Checks whether Docker is installed and accessible on the remote host.
     *
     * @param sessionId the active SSH session
     * @param userId    the requesting user's ID (ownership check)
     * @return true if {@code docker info} succeeds
     */
    boolean isDockerAvailable(String sessionId, UUID userId);

    /**
     * Retrieves high-level Docker daemon info (version, container counts, etc.).
     */
    DockerInfo getDockerInfo(String sessionId, UUID userId);

    /**
     * Returns the Docker overview: info + running containers + live stats.
     */
    DockerOverview getOverview(String sessionId, UUID userId);

    /**
     * Lists containers with optional filtering and pagination.
     *
     * @param all if true, includes stopped containers
     */
    ContainerPage listContainers(String sessionId, UUID userId, boolean all, int page, int pageSize);

    /**
     * Retrieves live stats for all running containers (single snapshot).
     */
    List<ContainerStats> getContainerStats(String sessionId, UUID userId);

    /**
     * Starts a stopped container.
     */
    ContainerActionResult startContainer(String sessionId, UUID userId, String containerId);

    /**
     * Stops a running container.
     */
    ContainerActionResult stopContainer(String sessionId, UUID userId, String containerId);

    /**
     * Restarts a container.
     */
    ContainerActionResult restartContainer(String sessionId, UUID userId, String containerId);

    /**
     * Removes a stopped container.
     */
    ContainerActionResult removeContainer(String sessionId, UUID userId, String containerId);

    /**
     * Retrieves the last N lines of a container's logs.
     */
    String getContainerLogs(String sessionId, UUID userId, String containerId, int tailLines);

    /**
     * Lists Docker images on the remote host.
     */
    ImagePage listImages(String sessionId, UUID userId);

    /**
     * Removes a Docker image by ID or repository:tag.
     */
    ContainerActionResult removeImage(String sessionId, UUID userId, String imageId);
}
