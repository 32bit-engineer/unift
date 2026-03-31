package com.weekend.architect.unift.remote.docker;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.exception.DockerException;
import com.github.dockerjava.api.exception.NotFoundException;
import com.github.dockerjava.api.model.Container;
import com.github.dockerjava.api.model.ContainerPort;
import com.github.dockerjava.api.model.Frame;
import com.github.dockerjava.api.model.Image;
import com.github.dockerjava.api.model.Info;
import com.github.dockerjava.api.model.Statistics;
import com.github.dockerjava.api.model.StatisticNetworksConfig;
import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.docker.DockerModels.ContainerActionResult;
import com.weekend.architect.unift.remote.docker.DockerModels.ContainerPage;
import com.weekend.architect.unift.remote.docker.DockerModels.ContainerStats;
import com.weekend.architect.unift.remote.docker.DockerModels.DockerImage;
import com.weekend.architect.unift.remote.docker.DockerModels.DockerInfo;
import com.weekend.architect.unift.remote.docker.DockerModels.DockerOverview;
import com.weekend.architect.unift.remote.docker.DockerModels.ImagePage;
import com.weekend.architect.unift.remote.exception.RemoteConnectionException;
import com.weekend.architect.unift.remote.exception.SessionAccessDeniedException;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

/**
 * Docker management service using the <a href="https://github.com/docker-java/docker-java">
 * docker-java</a> API client.
 *
 * <h3>How it connects</h3>
 * <p>On first use for a given SSH session, {@link DockerClientPool} establishes a
 * direct HTTP connection to the Docker daemon:
 * <ul>
 *   <li><b>TCP endpoint</b> (when {@code $DOCKER_HOST} is a tcp:// URL) — optionally
 *       tunnelled through an SSH port-forward if not directly reachable.</li>
 *   <li><b>Unix socket</b> (the default) — bridged to TCP via a {@code socat} process
 *       on the remote host, then SSH-tunnelled locally.</li>
 * </ul>
 *
 * <h3>Why this replaces the previous SSH-exec approach</h3>
 * <p>The old implementation ran Docker CLI commands through {@code ChannelExec} on the
 * same JSch session that powers the interactive terminal ({@code ChannelShell}).
 * Slow commands like {@code docker stats --no-stream} held exec channels open for
 * several seconds, causing channel contention that abruptly closed the terminal
 * WebSocket (visible as blank screen in the Docker workspace).  The API client uses a
 * completely separate HTTP transport with no shared state with the SSH terminal.
 */
@Slf4j
@Service
public class DockerServiceImpl implements DockerService {

    private static final Pattern CONTAINER_ID_PATTERN = Pattern.compile("^[a-fA-F0-9]+$");
    private static final Pattern IMAGE_ID_PATTERN = Pattern.compile("^[a-zA-Z0-9_./:@-]+$");

    private static final DateTimeFormatter DT_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC);

    private static final long CACHE_TTL_MS = 30_000L;
    private static final long STATS_CACHE_TTL_MS = 15_000L;

    private final ConcurrentHashMap<String, long[]> cacheExpiry = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Object> cache = new ConcurrentHashMap<>();

    private final SessionRegistry sessionRegistry;
    private final DockerClientPool dockerClientPool;
    /** Used to collect per-container stats in parallel without blocking platform threads. */
    private final ExecutorService virtualThreadExecutor;

    public DockerServiceImpl(
            SessionRegistry sessionRegistry,
            DockerClientPool dockerClientPool,
            @Qualifier("virtualThreadExecutor") ExecutorService virtualThreadExecutor) {
        this.sessionRegistry = sessionRegistry;
        this.dockerClientPool = dockerClientPool;
        this.virtualThreadExecutor = virtualThreadExecutor;
    }

    // ─── Availability / info ─────────────────────────────────────────────────

    @Override
    public boolean isDockerAvailable(String sessionId, UUID userId) {
        try {
            DockerClient client = resolveClient(sessionId, userId);
            client.pingCmd().exec();
            return true;
        } catch (Exception e) {
            log.debug("[docker] Docker not available on session {}: {}", sessionId, e.getMessage());
            return false;
        }
    }

    @Override
    public DockerInfo getDockerInfo(String sessionId, UUID userId) {
        String cacheKey = sessionId + ":dockerInfo";
        DockerInfo cached = fromCache(cacheKey, DockerInfo.class);
        if (cached != null) return cached;

        try {
            Info info = resolveClient(sessionId, userId).infoCmd().exec();
            DockerInfo result = mapInfo(info);
            putCache(cacheKey, result, CACHE_TTL_MS);
            return result;
        } catch (Exception e) {
            log.warn("[docker] Failed to get Docker info for session {}: {}", sessionId, e.getMessage());
            return DockerInfo.builder().available(false).build();
        }
    }

    @Override
    public DockerOverview getOverview(String sessionId, UUID userId) {
        String cacheKey = sessionId + ":overview";
        DockerOverview cached = fromCache(cacheKey, DockerOverview.class);
        if (cached != null) return cached;

        try {
            DockerClient client = resolveClient(sessionId, userId);

            // Fetch info, running containers, and stats concurrently
            CompletableFuture<DockerInfo> infoFuture = CompletableFuture.supplyAsync(
                    () -> {
                        try {
                            return mapInfo(client.infoCmd().exec());
                        } catch (Exception e) {
                            log.warn("[docker] Overview info error: {}", e.getMessage());
                            return DockerInfo.builder().available(false).build();
                        }
                    },
                    virtualThreadExecutor);

            CompletableFuture<List<DockerModels.Container>> runningFuture = CompletableFuture.supplyAsync(
                    () -> {
                        try {
                            return client.listContainersCmd()
                                    .withShowAll(false)
                                    .exec()
                                    .stream()
                                    .map(this::mapContainer)
                                    .toList();
                        } catch (Exception e) {
                            log.warn("[docker] Overview containers error: {}", e.getMessage());
                            return List.of();
                        }
                    },
                    virtualThreadExecutor);

            CompletableFuture<List<ContainerStats>> statsFuture = CompletableFuture.supplyAsync(
                    () -> collectAllStats(client),
                    virtualThreadExecutor);

            DockerOverview result = DockerOverview.builder()
                    .info(infoFuture.get(30, TimeUnit.SECONDS))
                    .runningContainers(runningFuture.get(30, TimeUnit.SECONDS))
                    .stats(statsFuture.get(30, TimeUnit.SECONDS))
                    .build();

            putCache(cacheKey, result, CACHE_TTL_MS);
            return result;
        } catch (Exception e) {
            log.warn("[docker] Failed to get overview for session {}: {}", sessionId, e.getMessage());
            return DockerOverview.builder()
                    .info(DockerInfo.builder().available(false).build())
                    .runningContainers(List.of())
                    .stats(List.of())
                    .build();
        }
    }

    // ─── Containers ──────────────────────────────────────────────────────────

    @Override
    public ContainerPage listContainers(String sessionId, UUID userId, boolean all, int page, int pageSize) {
        String cacheKey = sessionId + ":containers:" + all;
        @SuppressWarnings("unchecked")
        List<DockerModels.Container> allContainers = fromCacheList(cacheKey);
        if (allContainers == null) {
            try {
                allContainers = resolveClient(sessionId, userId).listContainersCmd()
                        .withShowAll(all)
                        .withShowSize(true)
                        .exec()
                        .stream()
                        .map(this::mapContainer)
                        .toList();
                putCache(cacheKey, allContainers, CACHE_TTL_MS);
            } catch (Exception e) {
                log.warn("[docker] Failed to list containers for session {}: {}", sessionId, e.getMessage());
                allContainers = List.of();
            }
        }
        int total = allContainers.size();
        int fromIdx = Math.min(page * pageSize, total);
        int toIdx = Math.min(fromIdx + pageSize, total);
        return ContainerPage.builder()
                .containers(allContainers.subList(fromIdx, toIdx))
                .total(total)
                .page(page)
                .pageSize(pageSize)
                .build();
    }

    @Override
    public List<ContainerStats> getContainerStats(String sessionId, UUID userId) {
        String cacheKey = sessionId + ":stats";
        @SuppressWarnings("unchecked")
        List<ContainerStats> cached = fromCacheList(cacheKey);
        if (cached != null) return cached;

        List<ContainerStats> result = collectAllStats(resolveClient(sessionId, userId));
        putCache(cacheKey, result, STATS_CACHE_TTL_MS);
        return result;
    }

    @Override
    public ContainerActionResult startContainer(String sessionId, UUID userId, String containerId) {
        validateContainerId(containerId);
        return executeAction(sessionId, userId, containerId, "start", client ->
                client.startContainerCmd(containerId).exec());
    }

    @Override
    public ContainerActionResult stopContainer(String sessionId, UUID userId, String containerId) {
        validateContainerId(containerId);
        return executeAction(sessionId, userId, containerId, "stop", client ->
                client.stopContainerCmd(containerId).exec());
    }

    @Override
    public ContainerActionResult restartContainer(String sessionId, UUID userId, String containerId) {
        validateContainerId(containerId);
        return executeAction(sessionId, userId, containerId, "restart", client ->
                client.restartContainerCmd(containerId).exec());
    }

    @Override
    public ContainerActionResult removeContainer(String sessionId, UUID userId, String containerId) {
        validateContainerId(containerId);
        return executeAction(sessionId, userId, containerId, "rm", client ->
                client.removeContainerCmd(containerId).exec());
    }

    @Override
    public String getContainerLogs(String sessionId, UUID userId, String containerId, int tailLines) {
        validateContainerId(containerId);
        int safeTail = Math.min(Math.max(tailLines, 1), 5000);
        StringBuilder sb = new StringBuilder();
        try {
            CountDownLatch latch = new CountDownLatch(1);
            resolveClient(sessionId, userId)
                    .logContainerCmd(containerId)
                    .withFollowStream(false)
                    .withTail(safeTail)
                    .withStdOut(true)
                    .withStdErr(true)
                    .withTimestamps(false)
                    .exec(new ResultCallback.Adapter<Frame>() {
                        @Override
                        public void onNext(Frame frame) {
                            sb.append(new String(frame.getPayload(), StandardCharsets.UTF_8));
                        }

                        @Override
                        public void onComplete() {
                            latch.countDown();
                        }

                        @Override
                        public void onError(Throwable throwable) {
                            log.warn("[docker] Log stream error for {}: {}", containerId, throwable.getMessage());
                            latch.countDown();
                        }
                    });
            latch.await(30, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new RemoteConnectionException("Failed to retrieve container logs: " + e.getMessage());
        }
        return sb.toString();
    }

    // ─── Images ──────────────────────────────────────────────────────────────

    @Override
    public ImagePage listImages(String sessionId, UUID userId) {
        String cacheKey = sessionId + ":images";
        ImagePage cached = fromCache(cacheKey, ImagePage.class);
        if (cached != null) return cached;

        try {
            List<DockerImage> images = resolveClient(sessionId, userId).listImagesCmd().exec()
                    .stream()
                    .flatMap(img -> expandImageTags(img).stream())
                    .toList();
            ImagePage result = ImagePage.builder().images(images).total(images.size()).build();
            putCache(cacheKey, result, CACHE_TTL_MS);
            return result;
        } catch (Exception e) {
            log.warn("[docker] Failed to list images for session {}: {}", sessionId, e.getMessage());
            return ImagePage.builder().images(List.of()).total(0).build();
        }
    }

    @Override
    public ContainerActionResult removeImage(String sessionId, UUID userId, String imageId) {
        validateImageId(imageId);
        DockerClient client = resolveClient(sessionId, userId);
        try {
            client.removeImageCmd(imageId).exec();
            invalidateSessionCache(sessionId);
            return ContainerActionResult.builder()
                    .containerId(imageId)
                    .action("remove_image")
                    .success(true)
                    .message("Image removed")
                    .build();
        } catch (NotFoundException e) {
            return ContainerActionResult.builder()
                    .containerId(imageId)
                    .action("remove_image")
                    .success(false)
                    .message("Image not found: " + imageId)
                    .build();
        } catch (DockerException e) {
            return ContainerActionResult.builder()
                    .containerId(imageId)
                    .action("remove_image")
                    .success(false)
                    .message(e.getMessage())
                    .build();
        }
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    /**
     * Resolves the Docker client for the session, checking ownership.
     * Unlike the old implementation, this does NOT use the SSH exec channel —
     * it creates/reuses a separate HTTP connection to the Docker daemon.
     */
    private DockerClient resolveClient(String sessionId, UUID userId) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        if (!conn.getSession().getOwnerId().equals(userId)) {
            throw new SessionAccessDeniedException("Not authorized for session " + sessionId);
        }
        if (!(conn instanceof RemoteShell shell)) {
            throw new RemoteConnectionException("Session does not support Docker access");
        }
        return dockerClientPool.resolveForSession(sessionId, shell);
    }

    /** Executes a mutating container action and invalidates relevant cache entries. */
    private ContainerActionResult executeAction(
            String sessionId,
            UUID userId,
            String containerId,
            String actionName,
            ThrowingConsumer<DockerClient> action) {
        DockerClient client = resolveClient(sessionId, userId);
        try {
            action.accept(client);
            invalidateSessionCache(sessionId);
            return ContainerActionResult.builder()
                    .containerId(containerId)
                    .action(actionName)
                    .success(true)
                    .message("Container " + actionName + " successful")
                    .build();
        } catch (NotFoundException e) {
            return ContainerActionResult.builder()
                    .containerId(containerId)
                    .action(actionName)
                    .success(false)
                    .message("Container not found: " + containerId)
                    .build();
        } catch (Exception e) {
            log.warn("[docker] Action '{}' failed for container {}: {}", actionName, containerId, e.getMessage());
            return ContainerActionResult.builder()
                    .containerId(containerId)
                    .action(actionName)
                    .success(false)
                    .message(e.getMessage())
                    .build();
        }
    }

    /**
     * Collects stats for all running containers in parallel using virtual threads.
     * Each container's stats are fetched independently — a slow or unresponsive
     * container does not block the others.
     */
    private List<ContainerStats> collectAllStats(DockerClient client) {
        List<Container> running;
        try {
            running = client.listContainersCmd().withShowAll(false).exec();
        } catch (Exception e) {
            log.warn("[docker] Failed to list running containers for stats: {}", e.getMessage());
            return List.of();
        }
        if (running.isEmpty()) return List.of();

        List<CompletableFuture<ContainerStats>> futures = running.stream()
                .map(c -> CompletableFuture.supplyAsync(
                        () -> fetchSingleContainerStats(client, c.getId(), extractContainerName(c)),
                        virtualThreadExecutor))
                .toList();

        return futures.stream()
                .map(f -> {
                    try {
                        return f.get(15, TimeUnit.SECONDS);
                    } catch (Exception e) {
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .toList();
    }

    /** Fetches a single stats snapshot for one container (blocking up to 10 s). */
    private ContainerStats fetchSingleContainerStats(DockerClient client, String containerId, String name) {
        AtomicReference<Statistics> statsRef = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        try {
            client.statsCmd(containerId)
                    .withNoStream(true)
                    .exec(new ResultCallback.Adapter<Statistics>() {
                        @Override
                        public void onNext(Statistics stats) {
                            statsRef.set(stats);
                            latch.countDown();
                        }

                        @Override
                        public void onError(Throwable throwable) {
                            latch.countDown();
                        }

                        @Override
                        public void onComplete() {
                            latch.countDown();
                        }
                    });

            boolean received = latch.await(10, TimeUnit.SECONDS);
            if (!received || statsRef.get() == null) return null;
            return mapStatistics(statsRef.get(),
                    containerId.substring(0, Math.min(12, containerId.length())), name);
        } catch (Exception e) {
            log.debug("[docker] Stats failed for container {}: {}", containerId, e.getMessage());
            return null;
        }
    }

    // ─── Model mappers ───────────────────────────────────────────────────────

    private DockerInfo mapInfo(Info info) {
        return DockerInfo.builder()
                .available(true)
                .version(nvl(info.getServerVersion()))
                .totalContainers(nvl(info.getContainers(), 0))
                .runningContainers(nvl(info.getContainersRunning(), 0))
                .stoppedContainers(nvl(info.getContainersStopped(), 0))
                .pausedContainers(nvl(info.getContainersPaused(), 0))
                .totalImages(nvl(info.getImages(), 0))
                .serverOs(nvl(info.getOsType()))
                .storageDriver(nvl(info.getDriver()))
                .build();
    }

    private DockerModels.Container mapContainer(Container c) {
        return DockerModels.Container.builder()
                .id(c.getId() != null ? c.getId().substring(0, Math.min(12, c.getId().length())) : "")
                .names(formatNames(c.getNames()))
                .image(nvl(c.getImage()))
                .state(nvl(c.getState()))
                .status(nvl(c.getStatus()))
                .ports(formatPorts(c.getPorts()))
                .createdAt(c.getCreated() != null ? DT_FMT.format(Instant.ofEpochSecond(c.getCreated())) : "")
                .size(formatContainerSize(c))
                .networks(formatNetworks(c))
                .build();
    }

    private ContainerStats mapStatistics(Statistics stats, String shortId, String name) {
        // CPU %
        double cpuPercent = 0.0;
        if (stats.getCpuStats() != null && stats.getPreCpuStats() != null
                && stats.getCpuStats().getCpuUsage() != null
                && stats.getPreCpuStats().getCpuUsage() != null) {
            long cpuDelta = nvl(stats.getCpuStats().getCpuUsage().getTotalUsage(), 0L)
                    - nvl(stats.getPreCpuStats().getCpuUsage().getTotalUsage(), 0L);
            long systemDelta = nvl(stats.getCpuStats().getSystemCpuUsage(), 0L)
                    - nvl(stats.getPreCpuStats().getSystemCpuUsage(), 0L);
            long numCpus = nvl(stats.getCpuStats().getOnlineCpus(), 1L);
            if (numCpus <= 0) numCpus = 1;
            if (systemDelta > 0) {
                cpuPercent = (double) cpuDelta / systemDelta * numCpus * 100.0;
            }
        }

        // Memory
        long memUsage = 0, memLimit = 0;
        if (stats.getMemoryStats() != null) {
            memUsage = nvl(stats.getMemoryStats().getUsage(), 0L);
            memLimit = nvl(stats.getMemoryStats().getLimit(), 0L);
        }
        double memPercent = memLimit > 0 ? (double) memUsage / memLimit * 100.0 : 0.0;

        // Network I/O (aggregate all interfaces)
        long rxBytes = 0, txBytes = 0;
        if (stats.getNetworks() != null) {
            for (StatisticNetworksConfig net : stats.getNetworks().values()) {
                rxBytes += nvl(net.getRxBytes(), 0L);
                txBytes += nvl(net.getTxBytes(), 0L);
            }
        }

        // Block I/O
        long readBytes = 0, writeBytes = 0;
        if (stats.getBlkioStats() != null && stats.getBlkioStats().getIoServiceBytesRecursive() != null) {
            for (var entry : stats.getBlkioStats().getIoServiceBytesRecursive()) {
                if (entry.getOp() == null) continue;
                if (entry.getOp().equalsIgnoreCase("read"))
                    readBytes += nvl(entry.getValue(), 0L);
                else if (entry.getOp().equalsIgnoreCase("write"))
                    writeBytes += nvl(entry.getValue(), 0L);
            }
        }

        return ContainerStats.builder()
                .containerId(shortId)
                .name(name)
                .cpuPercent(String.format("%.2f%%", cpuPercent))
                .memoryUsage(formatBytes(memUsage))
                .memoryLimit(formatBytes(memLimit))
                .memoryPercent(String.format("%.2f%%", memPercent))
                .networkIo(formatBytes(rxBytes) + " / " + formatBytes(txBytes))
                .blockIo(formatBytes(readBytes) + " / " + formatBytes(writeBytes))
                .build();
    }

    private List<DockerImage> expandImageTags(Image image) {
        if (image.getRepoTags() == null || image.getRepoTags().length == 0) {
            return List.of(buildImageRecord(image, "<none>", "<none>"));
        }
        return Arrays.stream(image.getRepoTags())
                .map(tag -> {
                    String[] parts = tag.split(":", 2);
                    return buildImageRecord(image, parts[0], parts.length > 1 ? parts[1] : "latest");
                })
                .toList();
    }

    private DockerImage buildImageRecord(Image image, String repository, String tag) {
        String rawId = nvl(image.getId());
        String shortId = rawId.startsWith("sha256:") ? rawId.substring(7, Math.min(rawId.length(), 19)) : rawId;
        String createdAt = image.getCreated() != null
                ? DT_FMT.format(Instant.ofEpochSecond(image.getCreated()))
                : "";
        return DockerImage.builder()
                .id(shortId)
                .repository(repository)
                .tag(tag)
                .size(formatBytes(nvl(image.getSize(), 0L)))
                .createdAt(createdAt)
                .createdSince("")
                .build();
    }

    // ─── Formatting helpers ──────────────────────────────────────────────────

    private String extractContainerName(Container c) {
        if (c.getNames() == null || c.getNames().length == 0) return c.getId();
        return c.getNames()[0].replaceFirst("^/", "");
    }

    private String formatNames(String[] names) {
        if (names == null || names.length == 0) return "";
        return Arrays.stream(names)
                .map(n -> n.replaceFirst("^/", ""))
                .collect(Collectors.joining(", "));
    }

    private String formatPorts(ContainerPort[] ports) {
        if (ports == null || ports.length == 0) return "";
        return Arrays.stream(ports)
                .filter(p -> p.getPublicPort() != null)
                .map(p -> {
                    String ip = p.getIp() != null && !p.getIp().isEmpty() ? p.getIp() + ":" : "";
                    return ip + p.getPublicPort() + "->" + p.getPrivatePort() + "/" + p.getType();
                })
                .collect(Collectors.joining(", "));
    }

    private String formatContainerSize(Container c) {
        long rootFs = c.getSizeRootFs() != null ? c.getSizeRootFs() : 0;
        long rw = c.getSizeRw() != null ? c.getSizeRw() : 0;
        if (rootFs == 0 && rw == 0) return "";
        return formatBytes(rw) + " (virtual " + formatBytes(rootFs) + ")";
    }

    private String formatNetworks(Container c) {
        if (c.getNetworkSettings() == null) return "";
        Map<String, ?> networks = c.getNetworkSettings().getNetworks();
        if (networks == null || networks.isEmpty()) return "";
        return String.join(", ", networks.keySet());
    }

    private String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + "B";
        double kb = bytes / 1024.0;
        if (kb < 1024) return String.format("%.1fKB", kb);
        double mb = kb / 1024.0;
        if (mb < 1024) return String.format("%.1fMB", mb);
        return String.format("%.2fGB", mb / 1024.0);
    }

    // ─── Validation helpers ──────────────────────────────────────────────────

    private void validateContainerId(String containerId) {
        if (containerId == null || !CONTAINER_ID_PATTERN.matcher(containerId).matches()) {
            throw new IllegalArgumentException("Invalid container ID: must be hexadecimal");
        }
    }

    private void validateImageId(String imageId) {
        if (imageId == null || !IMAGE_ID_PATTERN.matcher(imageId).matches()) {
            throw new IllegalArgumentException("Invalid image reference");
        }
    }

    // ─── Cache helpers ───────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private <T> T fromCache(String key, Class<T> type) {
        long[] expiry = cacheExpiry.get(key);
        if (expiry != null && System.currentTimeMillis() < expiry[0]) {
            return type.cast(cache.get(key));
        }
        cache.remove(key);
        cacheExpiry.remove(key);
        return null;
    }

    @SuppressWarnings("unchecked")
    private <T> List<T> fromCacheList(String key) {
        long[] expiry = cacheExpiry.get(key);
        if (expiry != null && System.currentTimeMillis() < expiry[0]) {
            Object val = cache.get(key);
            if (val instanceof List) return (List<T>) val;
        }
        cache.remove(key);
        cacheExpiry.remove(key);
        return null;
    }

    private void putCache(String key, Object value, long ttlMs) {
        cache.put(key, value);
        cacheExpiry.put(key, new long[]{System.currentTimeMillis() + ttlMs});
    }

    private void invalidateSessionCache(String sessionId) {
        String prefix = sessionId + ":";
        cache.keySet().removeIf(k -> k.startsWith(prefix));
        cacheExpiry.keySet().removeIf(k -> k.startsWith(prefix));
    }

    // ─── Null-safe helpers ───────────────────────────────────────────────────

    private String nvl(String value) {
        return value != null ? value : "";
    }

    private int nvl(Integer value, int fallback) {
        return value != null ? value : fallback;
    }

    private long nvl(Long value, long fallback) {
        return value != null ? value : fallback;
    }

    // ─── Functional interface ────────────────────────────────────────────────

    @FunctionalInterface
    private interface ThrowingConsumer<T> {
        void accept(T t) throws Exception;
    }
}
