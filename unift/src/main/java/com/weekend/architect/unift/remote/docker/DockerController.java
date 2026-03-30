package com.weekend.architect.unift.remote.docker;

import com.weekend.architect.unift.remote.docker.DockerModels.ContainerActionResult;
import com.weekend.architect.unift.remote.docker.DockerModels.ContainerPage;
import com.weekend.architect.unift.remote.docker.DockerModels.ContainerStats;
import com.weekend.architect.unift.remote.docker.DockerModels.DockerInfo;
import com.weekend.architect.unift.remote.docker.DockerModels.DockerOverview;
import com.weekend.architect.unift.remote.docker.DockerModels.ImagePage;
import com.weekend.architect.unift.security.UniFtUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for Docker container and image management.
 * All operations execute Docker CLI commands on the remote host
 * through the session's SSH connection.
 *
 * Base path: {@code /api/remote/sessions/{sessionId}/docker}
 */
@RestController
@RequestMapping("/api/remote/sessions/{sessionId}/docker")
@RequiredArgsConstructor
@SecurityRequirement(name = "BearerAuth")
@Tag(name = "Docker", description = "Docker management via SSH")
public class DockerController {

    private final DockerService dockerService;

    @GetMapping("/status")
    @Operation(summary = "Check Docker availability on the remote host")
    public ResponseEntity<Map<String, Boolean>> checkDocker(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        boolean available = dockerService.isDockerAvailable(sessionId, userId);
        return ResponseEntity.ok(Map.of("available", available));
    }

    @GetMapping("/info")
    @Operation(summary = "Get Docker daemon info")
    public ResponseEntity<DockerInfo> getDockerInfo(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(dockerService.getDockerInfo(sessionId, userId));
    }

    @GetMapping("/overview")
    @Operation(summary = "Get Docker overview: info + running containers + stats")
    public ResponseEntity<DockerOverview> getOverview(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(dockerService.getOverview(sessionId, userId));
    }

    @GetMapping("/containers")
    @Operation(summary = "List Docker containers")
    public ResponseEntity<ContainerPage> listContainers(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "true") boolean all,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int pageSize) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(dockerService.listContainers(sessionId, userId, all, page, pageSize));
    }

    @GetMapping("/containers/stats")
    @Operation(summary = "Get live stats for all running containers")
    public ResponseEntity<List<ContainerStats>> getContainerStats(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(dockerService.getContainerStats(sessionId, userId));
    }

    @PostMapping("/containers/{containerId}/start")
    @Operation(summary = "Start a stopped container")
    public ResponseEntity<ContainerActionResult> startContainer(
            @PathVariable String sessionId,
            @PathVariable String containerId,
            @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(dockerService.startContainer(sessionId, userId, containerId));
    }

    @PostMapping("/containers/{containerId}/stop")
    @Operation(summary = "Stop a running container")
    public ResponseEntity<ContainerActionResult> stopContainer(
            @PathVariable String sessionId,
            @PathVariable String containerId,
            @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(dockerService.stopContainer(sessionId, userId, containerId));
    }

    @PostMapping("/containers/{containerId}/restart")
    @Operation(summary = "Restart a container")
    public ResponseEntity<ContainerActionResult> restartContainer(
            @PathVariable String sessionId,
            @PathVariable String containerId,
            @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(dockerService.restartContainer(sessionId, userId, containerId));
    }

    @DeleteMapping("/containers/{containerId}")
    @Operation(summary = "Remove a stopped container")
    public ResponseEntity<ContainerActionResult> removeContainer(
            @PathVariable String sessionId,
            @PathVariable String containerId,
            @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(dockerService.removeContainer(sessionId, userId, containerId));
    }

    @GetMapping("/containers/{containerId}/logs")
    @Operation(summary = "Get container logs (tail)")
    public ResponseEntity<Map<String, String>> getContainerLogs(
            @PathVariable String sessionId,
            @PathVariable String containerId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "200") int tail) {

        UUID userId = principal.user().getId();
        String logs = dockerService.getContainerLogs(sessionId, userId, containerId, tail);
        return ResponseEntity.ok(Map.of("logs", logs));
    }

    @GetMapping("/images")
    @Operation(summary = "List Docker images")
    public ResponseEntity<ImagePage> listImages(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(dockerService.listImages(sessionId, userId));
    }

    @DeleteMapping("/images/{imageId}")
    @Operation(summary = "Remove a Docker image")
    public ResponseEntity<ContainerActionResult> removeImage(
            @PathVariable String sessionId,
            @PathVariable String imageId,
            @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(dockerService.removeImage(sessionId, userId, imageId));
    }
}
