package com.weekend.architect.unift.remote.docker;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Service interface for Docker container management via SSH tunnel. All operations execute Docker
 * Engine API calls on the remote host through an SSH-tunnelled connection to the Docker daemon
 * socket.
 */
public interface DockerService {

    // -- System --

    /** Checks if the Docker daemon is reachable through the session's tunnel. */
    Map<String, Object> isDockerAvailable(String sessionId, UUID userId);

    /** Returns Docker daemon version, resource counts, and host info. */
    DockerModels.DockerSystemInfo getDockerInfo(String sessionId, UUID userId);

    /** Returns a high-level overview: system info, running containers, live stats. */
    DockerModels.DockerOverview getOverview(String sessionId, UUID userId);

    /** Returns only the currently running containers as a flat list, without stats. */
    List<DockerModels.DockerContainer> getRunningContainers(String sessionId, UUID userId);

    /** Opens a streaming SSE overview (system info + containers + stats) with the given interval. */
    SseEmitter streamOverview(String sessionId, UUID userId, int intervalMs);

    /** Opens a streaming SSE system-info snapshot with the given interval. */
    SseEmitter streamSystemInfo(String sessionId, UUID userId, int intervalMs);

    /** Opens a streaming SSE list of running containers (no stats) with the given interval. */
    SseEmitter streamRunningContainers(String sessionId, UUID userId, int intervalMs);

    /** Opens a streaming SSE point-in-time stats for all running containers with the given interval. */
    SseEmitter streamContainerStatsAll(String sessionId, UUID userId, int intervalMs);

    // -- Containers --

    /** Lists containers with pagination. Set {@code all=true} to include stopped. */
    DockerModels.ContainerPage listContainers(String sessionId, UUID userId, boolean all, int page, int pageSize);

    /** Returns detailed inspection of a single container. */
    DockerModels.ContainerDetail inspectContainer(String sessionId, UUID userId, String containerId);

    /** Creates a new container from the given specification. */
    DockerModels.CreateContainerResponse createContainer(
            String sessionId, UUID userId, DockerModels.CreateContainerRequest request);

    DockerModels.ContainerActionResult startContainer(String sessionId, UUID userId, String containerId);

    DockerModels.ContainerActionResult stopContainer(String sessionId, UUID userId, String containerId);

    DockerModels.ContainerActionResult restartContainer(String sessionId, UUID userId, String containerId);

    DockerModels.ContainerActionResult pauseContainer(String sessionId, UUID userId, String containerId);

    DockerModels.ContainerActionResult unpauseContainer(String sessionId, UUID userId, String containerId);

    DockerModels.ContainerActionResult removeContainer(
            String sessionId, UUID userId, String containerId, boolean force);

    DockerModels.ContainerActionResult renameContainer(
            String sessionId, UUID userId, String containerId, String newName);

    // -- Container Logs --

    /** Returns the last {@code tail} lines of container logs. */
    String getContainerLogs(String sessionId, UUID userId, String containerId, int tail, boolean timestamps);

    /** Opens a live log stream for a container via SSE. */
    SseEmitter streamContainerLogs(String sessionId, UUID userId, String containerId, int tail, boolean timestamps);

    // -- Container Exec --

    /** Runs a command inside a running container and returns its output. */
    DockerModels.ExecStartResult execInContainer(String sessionId, UUID userId, DockerModels.ExecCreateRequest request);

    // -- Stats --

    /** Returns a point-in-time stats snapshot for all running containers. */
    List<DockerModels.ContainerStats> getContainerStats(String sessionId, UUID userId);

    /** Opens a live stats stream for a single container via SSE. */
    SseEmitter streamContainerStats(String sessionId, UUID userId, String containerId);

    // -- Images --

    /** Lists all local images. */
    DockerModels.ImagePage listImages(String sessionId, UUID userId);

    /** Pulls an image from a registry, streaming progress via SSE. */
    SseEmitter pullImage(String sessionId, UUID userId, DockerModels.PullImageRequest request);

    DockerModels.ContainerActionResult removeImage(String sessionId, UUID userId, String imageId, boolean force);

    DockerModels.ContainerActionResult tagImage(String sessionId, UUID userId, String imageId, String repo, String tag);

    /** Removes all dangling images. */
    void pruneImages(String sessionId, UUID userId);

    // -- Networks --

    List<DockerModels.DockerNetwork> listNetworks(String sessionId, UUID userId);

    DockerModels.DockerNetwork inspectNetwork(String sessionId, UUID userId, String networkId);

    String createNetwork(String sessionId, UUID userId, DockerModels.CreateNetworkRequest request);

    void removeNetwork(String sessionId, UUID userId, String networkId);

    // -- Volumes --

    List<DockerModels.DockerVolume> listVolumes(String sessionId, UUID userId);

    DockerModels.DockerVolume inspectVolume(String sessionId, UUID userId, String volumeName);

    DockerModels.DockerVolume createVolume(String sessionId, UUID userId, DockerModels.CreateVolumeRequest request);

    void removeVolume(String sessionId, UUID userId, String volumeName);

    // -- Compose --

    /** Detects compose projects from container labels. */
    List<DockerModels.ComposeProject> listComposeProjects(String sessionId, UUID userId);

    /** Generates a docker-compose YAML file from the given service definitions. */
    String generateComposeFile(String sessionId, UUID userId, DockerModels.ComposeFileRequest request);
}
