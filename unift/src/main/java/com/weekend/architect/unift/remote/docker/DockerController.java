package com.weekend.architect.unift.remote.docker;

import com.weekend.architect.unift.security.UniFtUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * REST controller for Docker container management. All operations tunnel through the session's SSH
 * connection to the remote Docker daemon socket.
 *
 * <p>Base path: {@code /api/remote/sessions/{sessionId}/docker}
 */
@RestController
@RequestMapping("/api/remote/sessions/{sessionId}/docker")
@RequiredArgsConstructor
@Validated
@SecurityRequirement(name = "BearerAuth")
@Tag(name = "Docker", description = "Docker management via SSH tunnel")
public class DockerController {

        private static final long STREAM_TIMEOUT_MS = 30L * 60 * 1000;
        private static final int MIN_STREAM_INTERVAL_MS = 1000;
        private static final int MAX_STREAM_INTERVAL_MS = 60000;

    private final DockerService dockerService;
        @Qualifier("virtualThreadExecutor")
        private final ExecutorService virtualThreadExecutor;

    // -- System ----------------------------------------------------------------

    @GetMapping("/status")
    @Operation(summary = "Check Docker daemon connectivity")
    public ResponseEntity<Map<String, Boolean>> checkDocker(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        boolean available =
                dockerService.isDockerAvailable(sessionId, principal.user().getId());
        return ResponseEntity.ok(Map.of("available", available));
    }

    @GetMapping("/info")
    @Operation(summary = "Get Docker daemon system information")
    public ResponseEntity<DockerModels.DockerSystemInfo> getDockerInfo(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.getDockerInfo(sessionId, principal.user().getId()));
    }

    @GetMapping("/overview")
    @Operation(summary = "Full Docker overview: system info, running containers, stats")
    public ResponseEntity<DockerModels.DockerOverview> getOverview(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.getOverview(sessionId, principal.user().getId()));
    }

        @GetMapping(value = "/overview/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
        @Operation(summary = "Stream Docker overview snapshots via SSE")
        public SseEmitter streamOverview(
                        @PathVariable String sessionId,
                        @RequestParam(defaultValue = "5000") int intervalMs,
                        @AuthenticationPrincipal UniFtUserDetails principal) {
                UUID ownerId = principal.user().getId();
                int clampedIntervalMs = Math.max(MIN_STREAM_INTERVAL_MS, Math.min(MAX_STREAM_INTERVAL_MS, intervalMs));

                SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
                AtomicBoolean open = new AtomicBoolean(true);
                emitter.onCompletion(() -> open.set(false));
                emitter.onError(ex -> open.set(false));
                emitter.onTimeout(() -> {
                        open.set(false);
                        emitter.complete();
                });

                virtualThreadExecutor.submit(() -> {
                        while (open.get()) {
                                try {
                                        DockerModels.DockerOverview payload = dockerService.getOverview(sessionId, ownerId);
                                        emitter.send(SseEmitter.event().name("overview").data(payload));
                                        Thread.sleep(clampedIntervalMs);
                                } catch (InterruptedException ie) {
                                        Thread.currentThread().interrupt();
                                        open.set(false);
                                        emitter.complete();
                                        return;
                                } catch (Exception ex) {
                                        try {
                                                emitter.send(
                                                                SseEmitter.event()
                                                                                .name("error")
                                                                                .data(Map.of("message", ex.getMessage() != null ? ex.getMessage() : "Docker overview stream failed")));
                                        } catch (Exception ignored) {
                                                // Ignore nested emitter failures while unwinding stream.
                                        }
                                        open.set(false);
                                        emitter.completeWithError(ex);
                                        return;
                                }
                        }
                });

                return emitter;
        }

    // -- Containers ------------------------------------------------------------

    @GetMapping("/containers")
    @Operation(summary = "List containers with pagination")
    public ResponseEntity<DockerModels.ContainerPage> listContainers(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "true") boolean all,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize) {
        return ResponseEntity.ok(
                dockerService.listContainers(sessionId, principal.user().getId(), all, page, pageSize));
    }

    @GetMapping("/containers/{id}")
    @Operation(summary = "Inspect a container")
    public ResponseEntity<DockerModels.ContainerDetail> inspectContainer(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.inspectContainer(sessionId, principal.user().getId(), id));
    }

    @PostMapping("/containers")
    @Operation(summary = "Create a new container")
    public ResponseEntity<DockerModels.CreateContainerResponse> createContainer(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @Valid @RequestBody DockerModels.CreateContainerRequest request) {
        return ResponseEntity.ok(
                dockerService.createContainer(sessionId, principal.user().getId(), request));
    }

    @PostMapping("/containers/{id}/start")
    @Operation(summary = "Start a container")
    public ResponseEntity<DockerModels.ContainerActionResult> startContainer(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.startContainer(sessionId, principal.user().getId(), id));
    }

    @PostMapping("/containers/{id}/stop")
    @Operation(summary = "Stop a container")
    public ResponseEntity<DockerModels.ContainerActionResult> stopContainer(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.stopContainer(sessionId, principal.user().getId(), id));
    }

    @PostMapping("/containers/{id}/restart")
    @Operation(summary = "Restart a container")
    public ResponseEntity<DockerModels.ContainerActionResult> restartContainer(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.restartContainer(sessionId, principal.user().getId(), id));
    }

    @PostMapping("/containers/{id}/pause")
    @Operation(summary = "Pause a container")
    public ResponseEntity<DockerModels.ContainerActionResult> pauseContainer(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.pauseContainer(sessionId, principal.user().getId(), id));
    }

    @PostMapping("/containers/{id}/unpause")
    @Operation(summary = "Unpause a container")
    public ResponseEntity<DockerModels.ContainerActionResult> unpauseContainer(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.unpauseContainer(sessionId, principal.user().getId(), id));
    }

    @DeleteMapping("/containers/{id}")
    @Operation(summary = "Remove a container")
    public ResponseEntity<DockerModels.ContainerActionResult> removeContainer(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "false") boolean force) {
        return ResponseEntity.ok(
                dockerService.removeContainer(sessionId, principal.user().getId(), id, force));
    }

    @PatchMapping("/containers/{id}/rename")
    @Operation(summary = "Rename a container")
    public ResponseEntity<DockerModels.ContainerActionResult> renameContainer(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam String name) {
        return ResponseEntity.ok(
                dockerService.renameContainer(sessionId, principal.user().getId(), id, name));
    }

    // -- Container Logs --------------------------------------------------------

    @GetMapping("/containers/{id}/logs")
    @Operation(summary = "Get container logs (tail N lines)")
    public ResponseEntity<Map<String, String>> getContainerLogs(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "200") int tail,
            @RequestParam(defaultValue = "false") boolean timestamps) {
        String logs = dockerService.getContainerLogs(sessionId, principal.user().getId(), id, tail, timestamps);
        return ResponseEntity.ok(Map.of("logs", logs));
    }

    @GetMapping(value = "/containers/{id}/logs/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Stream container logs via SSE (follow mode)")
    public SseEmitter streamContainerLogs(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "100") int tail,
            @RequestParam(defaultValue = "false") boolean timestamps) {
        return dockerService.streamContainerLogs(sessionId, principal.user().getId(), id, tail, timestamps);
    }

    // -- Container Exec --------------------------------------------------------

    @PostMapping("/containers/{id}/exec")
    @Operation(summary = "Execute a command inside a running container")
    public ResponseEntity<DockerModels.ExecStartResult> execInContainer(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @Valid @RequestBody DockerModels.ExecCreateRequest request) {
        request.setContainerId(id);
        return ResponseEntity.ok(
                dockerService.execInContainer(sessionId, principal.user().getId(), request));
    }

    // -- Stats -----------------------------------------------------------------

    @GetMapping("/containers/stats")
    @Operation(summary = "Get point-in-time stats for all running containers")
    public ResponseEntity<List<DockerModels.ContainerStats>> getContainerStats(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.getContainerStats(sessionId, principal.user().getId()));
    }

        @GetMapping(value = "/containers/stats/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
        @Operation(summary = "Stream point-in-time stats for all running containers via SSE")
        public SseEmitter streamContainerStatsAll(
                        @PathVariable String sessionId,
                        @RequestParam(defaultValue = "5000") int intervalMs,
                        @AuthenticationPrincipal UniFtUserDetails principal) {
                UUID ownerId = principal.user().getId();
                int clampedIntervalMs = Math.max(MIN_STREAM_INTERVAL_MS, Math.min(MAX_STREAM_INTERVAL_MS, intervalMs));

                SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
                AtomicBoolean open = new AtomicBoolean(true);
                emitter.onCompletion(() -> open.set(false));
                emitter.onError(ex -> open.set(false));
                emitter.onTimeout(() -> {
                        open.set(false);
                        emitter.complete();
                });

                virtualThreadExecutor.submit(() -> {
                        while (open.get()) {
                                try {
                                        List<DockerModels.ContainerStats> payload = dockerService.getContainerStats(sessionId, ownerId);
                                        emitter.send(SseEmitter.event().name("stats").data(payload));
                                        Thread.sleep(clampedIntervalMs);
                                } catch (InterruptedException ie) {
                                        Thread.currentThread().interrupt();
                                        open.set(false);
                                        emitter.complete();
                                        return;
                                } catch (Exception ex) {
                                        try {
                                                emitter.send(
                                                                SseEmitter.event()
                                                                                .name("error")
                                                                                .data(Map.of("message", ex.getMessage() != null ? ex.getMessage() : "Docker stats stream failed")));
                                        } catch (Exception ignored) {
                                                // Ignore nested emitter failures while unwinding stream.
                                        }
                                        open.set(false);
                                        emitter.completeWithError(ex);
                                        return;
                                }
                        }
                });

                return emitter;
        }

    @GetMapping(value = "/containers/{id}/stats/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Stream live stats for a container via SSE")
    public SseEmitter streamContainerStats(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        return dockerService.streamContainerStats(sessionId, principal.user().getId(), id);
    }

    // -- Images ----------------------------------------------------------------

    @GetMapping("/images")
    @Operation(summary = "List local Docker images")
    public ResponseEntity<DockerModels.ImagePage> listImages(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.listImages(sessionId, principal.user().getId()));
    }

    @PostMapping(value = "/images/pull", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Pull an image from a registry (progress streamed via SSE)")
    public SseEmitter pullImage(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @Valid @RequestBody DockerModels.PullImageRequest request) {
        return dockerService.pullImage(sessionId, principal.user().getId(), request);
    }

    @DeleteMapping("/images/{id}")
    @Operation(summary = "Remove a Docker image")
    public ResponseEntity<DockerModels.ContainerActionResult> removeImage(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "false") boolean force) {
        return ResponseEntity.ok(
                dockerService.removeImage(sessionId, principal.user().getId(), id, force));
    }

    @PostMapping("/images/{id}/tag")
    @Operation(summary = "Tag a Docker image")
    public ResponseEntity<DockerModels.ContainerActionResult> tagImage(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam String repo,
            @RequestParam(defaultValue = "latest") String tag) {
        return ResponseEntity.ok(
                dockerService.tagImage(sessionId, principal.user().getId(), id, repo, tag));
    }

    @PostMapping("/images/prune")
    @Operation(summary = "Remove all dangling images")
    public ResponseEntity<Void> pruneImages(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        dockerService.pruneImages(sessionId, principal.user().getId());
        return ResponseEntity.noContent().build();
    }

    // -- Networks --------------------------------------------------------------

    @GetMapping("/networks")
    @Operation(summary = "List Docker networks")
    public ResponseEntity<List<DockerModels.DockerNetwork>> listNetworks(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.listNetworks(sessionId, principal.user().getId()));
    }

    @GetMapping("/networks/{id}")
    @Operation(summary = "Inspect a Docker network")
    public ResponseEntity<DockerModels.DockerNetwork> inspectNetwork(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.inspectNetwork(sessionId, principal.user().getId(), id));
    }

    @PostMapping("/networks")
    @Operation(summary = "Create a Docker network")
    public ResponseEntity<Map<String, String>> createNetwork(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @Valid @RequestBody DockerModels.CreateNetworkRequest request) {
        String networkId =
                dockerService.createNetwork(sessionId, principal.user().getId(), request);
        return ResponseEntity.ok(Map.of("id", networkId));
    }

    @DeleteMapping("/networks/{id}")
    @Operation(summary = "Remove a Docker network")
    public ResponseEntity<Void> removeNetwork(
            @PathVariable String sessionId,
            @PathVariable String id,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        dockerService.removeNetwork(sessionId, principal.user().getId(), id);
        return ResponseEntity.noContent().build();
    }

    // -- Volumes ---------------------------------------------------------------

    @GetMapping("/volumes")
    @Operation(summary = "List Docker volumes")
    public ResponseEntity<List<DockerModels.DockerVolume>> listVolumes(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.listVolumes(sessionId, principal.user().getId()));
    }

    @GetMapping("/volumes/{name}")
    @Operation(summary = "Inspect a Docker volume")
    public ResponseEntity<DockerModels.DockerVolume> inspectVolume(
            @PathVariable String sessionId,
            @PathVariable String name,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.inspectVolume(sessionId, principal.user().getId(), name));
    }

    @PostMapping("/volumes")
    @Operation(summary = "Create a Docker volume")
    public ResponseEntity<DockerModels.DockerVolume> createVolume(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @Valid @RequestBody DockerModels.CreateVolumeRequest request) {
        return ResponseEntity.ok(
                dockerService.createVolume(sessionId, principal.user().getId(), request));
    }

    @DeleteMapping("/volumes/{name}")
    @Operation(summary = "Remove a Docker volume")
    public ResponseEntity<Void> removeVolume(
            @PathVariable String sessionId,
            @PathVariable String name,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        dockerService.removeVolume(sessionId, principal.user().getId(), name);
        return ResponseEntity.noContent().build();
    }

    // -- Compose ---------------------------------------------------------------

    @GetMapping("/compose/projects")
    @Operation(summary = "List detected Docker Compose projects")
    public ResponseEntity<List<DockerModels.ComposeProject>> listComposeProjects(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                dockerService.listComposeProjects(sessionId, principal.user().getId()));
    }

    @PostMapping("/compose/generate")
    @Operation(summary = "Generate a docker-compose.yml from service definitions")
    public ResponseEntity<Map<String, String>> generateComposeFile(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @Valid @RequestBody DockerModels.ComposeFileRequest request) {
        String yaml =
                dockerService.generateComposeFile(sessionId, principal.user().getId(), request);
        return ResponseEntity.ok(Map.of("yaml", yaml));
    }
}
