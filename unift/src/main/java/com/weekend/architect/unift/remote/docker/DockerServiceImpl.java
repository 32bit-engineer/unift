package com.weekend.architect.unift.remote.docker;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.command.InspectContainerResponse;
import com.github.dockerjava.api.model.Container;
import com.github.dockerjava.api.model.Frame;
import com.github.dockerjava.api.model.HostConfig;
import com.github.dockerjava.api.model.Image;
import com.github.dockerjava.api.model.Info;
import com.github.dockerjava.api.model.PruneType;
import com.github.dockerjava.api.model.PullResponseItem;
import com.github.dockerjava.api.model.RestartPolicy;
import com.github.dockerjava.api.model.Statistics;
import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.exception.RemoteConnectionException;
import com.weekend.architect.unift.remote.exception.SessionAccessDeniedException;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

/**
 * Docker management service backed by the docker-java SDK.
 *
 * <p>Each method obtains a {@link DockerClient} from {@link DockerClientPool}, which is created
 * once per session (SSH tunnel + docker-java HTTP transport) and cached.
 *
 * <p>{@link #getOverview} fans out system info, containers, and stats calls in parallel via {@link
 * CompletableFuture}, reducing typical response time from sequential calls.
 */
@Slf4j
@Service
public class DockerServiceImpl implements DockerService {

    private final DockerClientPool dockerClientPool;
    private final SessionRegistry sessionRegistry;
    private final ExecutorService virtualExecutor;
    private final DockerLogStreamService logStreamService;
    private final DockerStatsStreamService statsStreamService;

    public DockerServiceImpl(
            DockerClientPool dockerClientPool,
            SessionRegistry sessionRegistry,
            @Qualifier("virtualThreadExecutor") ExecutorService virtualExecutor,
            DockerLogStreamService logStreamService,
            DockerStatsStreamService statsStreamService) {
        this.dockerClientPool = dockerClientPool;
        this.sessionRegistry = sessionRegistry;
        this.virtualExecutor = virtualExecutor;
        this.logStreamService = logStreamService;
        this.statsStreamService = statsStreamService;
    }

    // Validates container ID format (hex string, 12 or 64 chars, or valid name)
    private static void validateContainerId(String containerId) {
        if (containerId == null || containerId.isBlank()) {
            throw new IllegalArgumentException("Container ID must not be blank");
        }
        if (!containerId.matches("^[a-fA-F0-9]{12,64}$") && !containerId.matches("^[a-zA-Z][a-zA-Z0-9_.-]+$")) {
            throw new IllegalArgumentException("Invalid container ID or name format");
        }
    }

    // Validates image name format (repo:tag or repo@digest)
    private static void validateImageReference(String image) {
        if (image == null || image.isBlank()) {
            throw new IllegalArgumentException("Image reference must not be blank");
        }
        if (!image.matches("^[a-zA-Z0-9][a-zA-Z0-9._/-]*(:[a-zA-Z0-9._-]+)?(@sha256:[a-fA-F0-9]{64})?$")) {
            throw new IllegalArgumentException("Invalid image reference format");
        }
    }

    // Validates container name format
    private static void validateContainerName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Container name must not be blank");
        }
        if (!name.matches("^/?[a-zA-Z0-9][a-zA-Z0-9_.-]+$")) {
            throw new IllegalArgumentException("Invalid container name format");
        }
    }

    // -- System ----------------------------------------------------------------

    @Override
    public boolean isDockerAvailable(String sessionId, UUID userId) {
        try {
            resolveClient(sessionId, userId).pingCmd().exec();
            return true;
        } catch (Exception e) {
            log.debug("[docker] Daemon not reachable for session {}: {}", sessionId, e.getMessage());
            return false;
        }
    }

    @Override
    public DockerModels.DockerSystemInfo getDockerInfo(String sessionId, UUID userId) {
        try {
            Info info = resolveClient(sessionId, userId).infoCmd().exec();
            return DockerMappers.toSystemInfo(info);
        } catch (Exception e) {
            log.warn("[docker] Failed to get info for session {}: {}", sessionId, e.getMessage());
            return DockerModels.DockerSystemInfo.builder().available(false).build();
        }
    }

    @Override
    public DockerModels.DockerOverview getOverview(String sessionId, UUID userId) {
        DockerClient client = resolveClient(sessionId, userId);
        try {
            var infoFuture =
                    CompletableFuture.supplyAsync(() -> client.infoCmd().exec());
            var containersFuture = CompletableFuture.supplyAsync(
                    () -> client.listContainersCmd().withShowAll(false).exec());

            CompletableFuture.allOf(infoFuture, containersFuture)
                    .orTimeout(15, TimeUnit.SECONDS)
                    .join();

            var sysInfo = DockerMappers.toSystemInfo(infoFuture.join());
            var running = containersFuture.join().stream()
                    .map(DockerMappers::toContainer)
                    .toList();

            return DockerModels.DockerOverview.builder()
                    .info(sysInfo)
                    .runningContainers(running)
                    .stats(List.of())
                    .build();
        } catch (Exception e) {
            log.warn("[docker] Failed to get overview for session {}: {}", sessionId, e.getMessage());
            return DockerModels.DockerOverview.builder()
                    .info(DockerModels.DockerSystemInfo.builder()
                            .available(false)
                            .build())
                    .runningContainers(List.of())
                    .stats(List.of())
                    .build();
        }
    }

    // -- Containers ------------------------------------------------------------

    @Override
    public DockerModels.ContainerPage listContainers(
            String sessionId, UUID userId, boolean all, int page, int pageSize) {
        DockerClient client = resolveClient(sessionId, userId);
        try {
            List<Container> raw = client.listContainersCmd().withShowAll(all).exec();
            List<DockerModels.DockerContainer> mapped =
                    raw.stream().map(DockerMappers::toContainer).toList();
            int safePage = Math.max(1, page);
            int safeSize = Math.max(1, Math.min(pageSize, 100));
            int start = (safePage - 1) * safeSize;
            int end = Math.min(start + safeSize, mapped.size());
            List<DockerModels.DockerContainer> slice = start < mapped.size() ? mapped.subList(start, end) : List.of();
            return DockerModels.ContainerPage.builder()
                    .containers(slice)
                    .total(mapped.size())
                    .page(safePage)
                    .pageSize(safeSize)
                    .build();
        } catch (Exception e) {
            log.warn("[docker] Failed to list containers for session {}: {}", sessionId, e.getMessage());
            return DockerModels.ContainerPage.builder()
                    .containers(List.of())
                    .total(0)
                    .page(page)
                    .pageSize(pageSize)
                    .build();
        }
    }

    @Override
    public DockerModels.ContainerDetail inspectContainer(String sessionId, UUID userId, String containerId) {
        validateContainerId(containerId);
        DockerClient client = resolveClient(sessionId, userId);
        try {
            InspectContainerResponse r = client.inspectContainerCmd(containerId).exec();
            return DockerMappers.toContainerDetail(r);
        } catch (Exception e) {
            throw new RemoteConnectionException("Failed to inspect container " + containerId + ": " + e.getMessage());
        }
    }

    @Override
    public DockerModels.CreateContainerResponse createContainer(
            String sessionId, UUID userId, DockerModels.CreateContainerRequest request) {
        DockerClient client = resolveClient(sessionId, userId);
        try {
            var cmd = client.createContainerCmd(request.getImage());
            if (request.getName() != null) cmd.withName(request.getName());
            if (request.getEnv() != null) cmd.withEnv(request.getEnv());
            if (request.getCommand() != null) cmd.withCmd(request.getCommand());

            HostConfig hostConfig = HostConfig.newHostConfig();
            if (request.getRestartPolicy() != null) {
                hostConfig.withRestartPolicy(RestartPolicy.parse(request.getRestartPolicy()));
            }
            if (request.getNetworkMode() != null) {
                hostConfig.withNetworkMode(request.getNetworkMode());
            }
            if (request.getMemoryLimit() != null) hostConfig.withMemory(request.getMemoryLimit());
            if (request.getCpuShares() != null) hostConfig.withCpuShares(request.getCpuShares());
            cmd.withHostConfig(hostConfig);
            if (request.getLabels() != null) cmd.withLabels(request.getLabels());

            var resp = cmd.exec();
            return DockerModels.CreateContainerResponse.builder()
                    .id(resp.getId())
                    .warnings(resp.getWarnings() != null ? Arrays.asList(resp.getWarnings()) : List.of())
                    .build();
        } catch (Exception e) {
            throw new RemoteConnectionException("Failed to create container: " + e.getMessage());
        }
    }

    @Override
    public DockerModels.ContainerActionResult startContainer(String sessionId, UUID userId, String containerId) {
        validateContainerId(containerId);
        return containerAction(
                sessionId,
                userId,
                containerId,
                "start",
                c -> c.startContainerCmd(containerId).exec());
    }

    @Override
    public DockerModels.ContainerActionResult stopContainer(String sessionId, UUID userId, String containerId) {
        validateContainerId(containerId);
        return containerAction(
                sessionId,
                userId,
                containerId,
                "stop",
                c -> c.stopContainerCmd(containerId).exec());
    }

    @Override
    public DockerModels.ContainerActionResult restartContainer(String sessionId, UUID userId, String containerId) {
        validateContainerId(containerId);
        return containerAction(
                sessionId,
                userId,
                containerId,
                "restart",
                c -> c.restartContainerCmd(containerId).exec());
    }

    @Override
    public DockerModels.ContainerActionResult pauseContainer(String sessionId, UUID userId, String containerId) {
        validateContainerId(containerId);
        return containerAction(
                sessionId,
                userId,
                containerId,
                "pause",
                c -> c.pauseContainerCmd(containerId).exec());
    }

    @Override
    public DockerModels.ContainerActionResult unpauseContainer(String sessionId, UUID userId, String containerId) {
        validateContainerId(containerId);
        return containerAction(
                sessionId,
                userId,
                containerId,
                "unpause",
                c -> c.unpauseContainerCmd(containerId).exec());
    }

    @Override
    public DockerModels.ContainerActionResult removeContainer(
            String sessionId, UUID userId, String containerId, boolean force) {
        validateContainerId(containerId);
        return containerAction(
                sessionId,
                userId,
                containerId,
                "remove",
                c -> c.removeContainerCmd(containerId).withForce(force).exec());
    }

    @Override
    public DockerModels.ContainerActionResult renameContainer(
            String sessionId, UUID userId, String containerId, String newName) {
        validateContainerId(containerId);
        validateContainerName(newName);
        return containerAction(
                sessionId,
                userId,
                containerId,
                "rename",
                c -> c.renameContainerCmd(containerId).withName(newName).exec());
    }

    // -- Logs ------------------------------------------------------------------

    @Override
    public String getContainerLogs(String sessionId, UUID userId, String containerId, int tail, boolean timestamps) {
        validateContainerId(containerId);
        DockerClient client = resolveClient(sessionId, userId);
        int safeTail = Math.max(1, Math.min(tail, 5_000));
        try {
            StringBuilder sb = new StringBuilder();
            client.logContainerCmd(containerId)
                    .withStdOut(true)
                    .withStdErr(true)
                    .withTail(safeTail)
                    .withTimestamps(timestamps)
                    .exec(new ResultCallback.Adapter<Frame>() {
                        @Override
                        public void onNext(Frame frame) {
                            if (frame.getPayload() != null) {
                                sb.append(new String(frame.getPayload(), StandardCharsets.UTF_8));
                            }
                        }
                    })
                    .awaitCompletion(10, TimeUnit.SECONDS);
            return sb.toString();
        } catch (Exception e) {
            if (e instanceof InterruptedException _) {
                Thread.currentThread().interrupt();
            }
            log.warn("[docker] Failed to get logs for {} session {}: {}", containerId, sessionId, e.getMessage());
            return "Failed to fetch logs: " + e.getMessage();
        }
    }

    @Override
    public SseEmitter streamContainerLogs(
            String sessionId, UUID userId, String containerId, int tail, boolean timestamps) {
        validateContainerId(containerId);
        return logStreamService.streamContainerLogs(sessionId, userId, containerId, tail, timestamps);
    }

    // -- Exec ------------------------------------------------------------------

    @Override
    public DockerModels.ExecStartResult execInContainer(
            String sessionId, UUID userId, DockerModels.ExecCreateRequest request) {
        validateContainerId(request.getContainerId());
        if (request.getCommand() == null || request.getCommand().isEmpty()) {
            throw new IllegalArgumentException("Exec command must not be empty");
        }
        log.info("Exec in container {}: {}", request.getContainerId(), request.getCommand());
        DockerClient client = resolveClient(sessionId, userId);
        try {
            var execCreate = client.execCreateCmd(request.getContainerId())
                    .withCmd(request.getCommand().toArray(String[]::new))
                    .withAttachStdout(true)
                    .withAttachStderr(true)
                    .exec();

            StringBuilder output = new StringBuilder();
            client.execStartCmd(execCreate.getId())
                    .exec(new ResultCallback.Adapter<Frame>() {
                        @Override
                        public void onNext(Frame frame) {
                            if (frame.getPayload() != null) {
                                output.append(new String(frame.getPayload(), StandardCharsets.UTF_8));
                            }
                        }
                    })
                    .awaitCompletion(30, TimeUnit.SECONDS);

            var inspect = client.inspectExecCmd(execCreate.getId()).exec();
            int exitCode = inspect.getExitCodeLong() != null
                    ? inspect.getExitCodeLong().intValue()
                    : -1;
            return DockerModels.ExecStartResult.builder()
                    .output(output.toString())
                    .exitCode(exitCode)
                    .build();
        } catch (Exception e) {
            if (e instanceof InterruptedException _) {
                Thread.currentThread().interrupt();
            }
            return DockerModels.ExecStartResult.builder()
                    .output("Error: " + e.getMessage())
                    .exitCode(-1)
                    .build();
        }
    }

    // -- Stats -----------------------------------------------------------------

    @Override
    public List<DockerModels.ContainerStats> getContainerStats(String sessionId, UUID userId) {
        DockerClient client = resolveClient(sessionId, userId);
        try {
            List<Container> running =
                    client.listContainersCmd().withShowAll(false).exec();
            List<CompletableFuture<DockerModels.ContainerStats>> futures = running.stream()
                    .map(c -> CompletableFuture.supplyAsync(() -> fetchSingleStat(client, c.getId())))
                    .toList();
            CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new))
                    .orTimeout(10, TimeUnit.SECONDS)
                    .join();
            return futures.stream()
                    .map(CompletableFuture::join)
                    .filter(Objects::nonNull)
                    .toList();
        } catch (Exception e) {
            log.warn("[docker] Failed to get stats for session {}: {}", sessionId, e.getMessage());
            return List.of();
        }
    }

    @Override
    public SseEmitter streamContainerStats(String sessionId, UUID userId, String containerId) {
        return statsStreamService.streamContainerStats(sessionId, userId, containerId);
    }

    // -- Images ----------------------------------------------------------------

    @Override
    public DockerModels.ImagePage listImages(String sessionId, UUID userId) {
        DockerClient client = resolveClient(sessionId, userId);
        try {
            List<Image> images = client.listImagesCmd().exec();
            List<DockerModels.DockerImage> mapped =
                    images.stream().map(DockerMappers::toImage).toList();
            return DockerModels.ImagePage.builder()
                    .images(mapped)
                    .total(mapped.size())
                    .build();
        } catch (Exception e) {
            log.warn("[docker] Failed to list images for session {}: {}", sessionId, e.getMessage());
            return DockerModels.ImagePage.builder().images(List.of()).total(0).build();
        }
    }

    @Override
    public SseEmitter pullImage(String sessionId, UUID userId, DockerModels.PullImageRequest request) {
        validateImageReference(request.getRepository());
        DockerClient client = resolveClient(sessionId, userId);
        SseEmitter emitter = new SseEmitter(300_000L);
        String tag = request.getTag() != null && !request.getTag().isBlank() ? request.getTag() : "latest";

        virtualExecutor.submit(() -> {
            try {
                client.pullImageCmd(request.getRepository())
                        .withTag(tag)
                        .exec(new ResultCallback.Adapter<PullResponseItem>() {
                            @Override
                            public void onNext(PullResponseItem item) {
                                trySend(
                                        emitter,
                                        SseEmitter.event()
                                                .name("progress")
                                                .data(DockerModels.PullImageProgress.builder()
                                                        .status(item.getStatus())
                                                        .progress(
                                                                Objects.nonNull(item.getProgressDetail())
                                                                        ? item.getProgressDetail()
                                                                                .toString()
                                                                        : "")
                                                        .id(item.getId())
                                                        .build()));
                            }
                        })
                        .awaitCompletion();
                trySend(emitter, SseEmitter.event().name("complete").data("done"));
                emitter.complete();
            } catch (Exception e) {
                if (e instanceof InterruptedException _) {
                    Thread.currentThread().interrupt();
                }
                trySend(emitter, SseEmitter.event().name("error").data(Map.of("message", e.getMessage())));
                try {
                    emitter.complete();
                } catch (Exception _) {
                    // ignored
                }
            }
        });
        return emitter;
    }

    @Override
    public DockerModels.ContainerActionResult removeImage(
            String sessionId, UUID userId, String imageId, boolean force) {
        validateContainerId(imageId);
        return imageAction(
                sessionId,
                userId,
                imageId,
                "remove",
                c -> c.removeImageCmd(imageId).withForce(force).exec());
    }

    @Override
    public DockerModels.ContainerActionResult tagImage(
            String sessionId, UUID userId, String imageId, String repo, String tag) {
        validateContainerId(imageId);
        validateImageReference(repo + ":" + tag);
        return imageAction(
                sessionId,
                userId,
                imageId,
                "tag",
                c -> c.tagImageCmd(imageId, repo, tag).exec());
    }

    @Override
    public void pruneImages(String sessionId, UUID userId) {
        DockerClient client = resolveClient(sessionId, userId);
        client.pruneCmd(PruneType.IMAGES).exec();
    }

    // -- Networks --------------------------------------------------------------

    @Override
    public List<DockerModels.DockerNetwork> listNetworks(String sessionId, UUID userId) {
        DockerClient client = resolveClient(sessionId, userId);
        try {
            return client.listNetworksCmd().exec().stream()
                    .map(DockerMappers::toNetwork)
                    .toList();
        } catch (Exception e) {
            log.warn("[docker] Failed to list networks for session {}: {}", sessionId, e.getMessage());
            return List.of();
        }
    }

    @Override
    public DockerModels.DockerNetwork inspectNetwork(String sessionId, UUID userId, String networkId) {
        DockerClient client = resolveClient(sessionId, userId);
        return DockerMappers.toNetwork(
                client.inspectNetworkCmd().withNetworkId(networkId).exec());
    }

    @Override
    public String createNetwork(String sessionId, UUID userId, DockerModels.CreateNetworkRequest request) {
        DockerClient client = resolveClient(sessionId, userId);
        var cmd = client.createNetworkCmd().withName(request.getName());
        if (request.getDriver() != null) cmd.withDriver(request.getDriver());
        return cmd.exec().getId();
    }

    @Override
    public void removeNetwork(String sessionId, UUID userId, String networkId) {
        resolveClient(sessionId, userId).removeNetworkCmd(networkId).exec();
    }

    // -- Volumes ---------------------------------------------------------------

    @Override
    public List<DockerModels.DockerVolume> listVolumes(String sessionId, UUID userId) {
        DockerClient client = resolveClient(sessionId, userId);
        try {
            var resp = client.listVolumesCmd().exec();
            if (resp.getVolumes() == null) return List.of();
            return resp.getVolumes().stream().map(DockerMappers::toVolume).toList();
        } catch (Exception e) {
            log.warn("[docker] Failed to list volumes for session {}: {}", sessionId, e.getMessage());
            return List.of();
        }
    }

    @Override
    public DockerModels.DockerVolume inspectVolume(String sessionId, UUID userId, String volumeName) {
        return DockerMappers.toVolume(
                resolveClient(sessionId, userId).inspectVolumeCmd(volumeName).exec());
    }

    @Override
    public DockerModels.DockerVolume createVolume(
            String sessionId, UUID userId, DockerModels.CreateVolumeRequest request) {
        DockerClient client = resolveClient(sessionId, userId);
        var cmd = client.createVolumeCmd().withName(request.getName());
        if (request.getDriver() != null) cmd.withDriver(request.getDriver());
        if (request.getLabels() != null) cmd.withLabels(request.getLabels());
        return DockerMappers.toVolume(cmd.exec());
    }

    @Override
    public void removeVolume(String sessionId, UUID userId, String volumeName) {
        resolveClient(sessionId, userId).removeVolumeCmd(volumeName).exec();
    }

    // -- Compose ---------------------------------------------------------------

    @Override
    public List<DockerModels.ComposeProject> listComposeProjects(String sessionId, UUID userId) {
        DockerClient client = resolveClient(sessionId, userId);
        try {
            List<Container> all = client.listContainersCmd().withShowAll(true).exec();
            Map<String, List<Container>> projects = new LinkedHashMap<>();
            for (Container c : all) {
                if (c.getLabels() != null && c.getLabels().containsKey("com.docker.compose.project")) {
                    projects.computeIfAbsent(c.getLabels().get("com.docker.compose.project"), k -> new ArrayList<>())
                            .add(c);
                }
            }
            return projects.entrySet().stream()
                    .map(e -> {
                        String cfgFiles = e.getValue().stream()
                                .map(c -> c.getLabels().getOrDefault("com.docker.compose.project.config_files", ""))
                                .findFirst()
                                .orElse("");
                        boolean allRunning = e.getValue().stream().allMatch(c -> "running".equals(c.getState()));
                        return DockerModels.ComposeProject.builder()
                                .name(e.getKey())
                                .status(allRunning ? "running" : "partial")
                                .configFiles(cfgFiles)
                                .services(e.getValue().size())
                                .build();
                    })
                    .toList();
        } catch (Exception e) {
            log.warn("[docker] Failed to list compose projects: {}", e.getMessage());
            return List.of();
        }
    }

    @Override
    public String generateComposeFile(String sessionId, UUID userId, DockerModels.ComposeFileRequest request) {
        resolveClient(sessionId, userId); // validate access
        Map<String, Object> compose = new LinkedHashMap<>();
        Map<String, Object> services = new LinkedHashMap<>();
        for (var svc : request.getServices()) {
            Map<String, Object> def = new LinkedHashMap<>();
            def.put("image", svc.getImage());
            if (svc.getPorts() != null) def.put("ports", svc.getPorts());
            if (svc.getEnvironment() != null) def.put("environment", svc.getEnvironment());
            if (svc.getVolumes() != null) def.put("volumes", svc.getVolumes());
            if (svc.getNetworks() != null) def.put("networks", svc.getNetworks());
            if (svc.getDependsOn() != null) def.put("depends_on", svc.getDependsOn());
            if (svc.getRestart() != null) def.put("restart", svc.getRestart());
            if (svc.getCommand() != null) def.put("command", svc.getCommand());
            if (svc.getLabels() != null) def.put("labels", svc.getLabels());
            services.put(svc.getName(), def);
        }
        compose.put("services", services);
        DumperOptions opts = new DumperOptions();
        opts.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        opts.setPrettyFlow(true);
        return new Yaml(opts).dump(compose);
    }

    private DockerClient resolveClient(String sessionId, UUID userId) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        if (!conn.getSession().getOwnerId().equals(userId)) {
            log.warn("Unauthorized access attempt to session {} by user {}", sessionId, userId);
            throw new SessionAccessDeniedException("Not authorized for session " + sessionId);
        }
        return dockerClientPool.resolveForSession(sessionId, conn);
    }

    /** Executes a simple container lifecycle action with uniform result handling. */
    private DockerModels.ContainerActionResult containerAction(
            String sessionId,
            UUID userId,
            String containerId,
            String action,
            java.util.function.Consumer<DockerClient> command) {
        try {
            command.accept(resolveClient(sessionId, userId));
            return DockerModels.ContainerActionResult.builder()
                    .containerId(containerId)
                    .action(action)
                    .success(true)
                    .message("Container " + containerId + " " + action + " successful")
                    .build();
        } catch (Exception e) {
            return DockerModels.ContainerActionResult.builder()
                    .containerId(containerId)
                    .action(action)
                    .success(false)
                    .message(e.getMessage())
                    .build();
        }
    }

    private DockerModels.ContainerActionResult imageAction(
            String sessionId,
            UUID userId,
            String imageId,
            String action,
            java.util.function.Consumer<DockerClient> command) {
        try {
            command.accept(resolveClient(sessionId, userId));
            return DockerModels.ContainerActionResult.builder()
                    .containerId(imageId)
                    .action(action)
                    .success(true)
                    .message("Image " + imageId + " " + action + " successful")
                    .build();
        } catch (Exception e) {
            return DockerModels.ContainerActionResult.builder()
                    .containerId(imageId)
                    .action(action)
                    .success(false)
                    .message(e.getMessage())
                    .build();
        }
    }

    private DockerModels.ContainerStats fetchSingleStat(DockerClient client, String containerId) {
        try {
            Statistics[] holder = new Statistics[1];
            CountDownLatch latch = new CountDownLatch(1);
            AtomicInteger sampleCount = new AtomicInteger();
            var cb = new ResultCallback.Adapter<Statistics>() {
                @Override
                public void onNext(Statistics stats) {
                    holder[0] = stats;
                    int seen = sampleCount.incrementAndGet();
                    if (hasUsableCpuBaseline(stats) || seen >= 2) {
                        latch.countDown();
                        try {
                            close();
                        } catch (IOException _) {
                            // ignored
                        }
                    }
                }
            };
            client.statsCmd(containerId).exec(cb);
            if (!latch.await(3, TimeUnit.SECONDS)) {
                try {
                    cb.close();
                } catch (IOException _) {
                    // ignored
                }
            }
            cb.awaitCompletion(1, TimeUnit.SECONDS);
            return holder[0] != null ? DockerStatsStreamService.computeStats(containerId, holder[0]) : null;
        } catch (Exception e) {
            if (e instanceof InterruptedException _) {
                Thread.currentThread().interrupt();
            }
            log.debug("[docker] Failed to get stats for container {}: {}", containerId, e.getMessage());
            return null;
        }
    }

    static boolean hasUsableCpuBaseline(Statistics stats) {
        return stats != null
                && stats.getCpuStats() != null
                && stats.getPreCpuStats() != null
                && stats.getCpuStats().getCpuUsage() != null
                && stats.getPreCpuStats().getCpuUsage() != null
                && stats.getCpuStats().getSystemCpuUsage() != null
                && stats.getPreCpuStats().getSystemCpuUsage() != null
                && stats.getPreCpuStats().getSystemCpuUsage() > 0
                && stats.getPreCpuStats().getCpuUsage().getTotalUsage() > 0;
    }

    private void trySend(SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IllegalStateException | IOException _) {
            // ignored
        }
    }
}
