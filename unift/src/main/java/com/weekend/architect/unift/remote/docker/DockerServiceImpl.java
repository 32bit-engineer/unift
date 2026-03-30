package com.weekend.architect.unift.remote.docker;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.docker.DockerModels.Container;
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
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Docker management service that executes Docker CLI commands
 * over the existing SSH connection.
 *
 * All commands are purely read-from or send-to the remote shell
 * via {@link RemoteShell#executeCommand(String)}. No Docker
 * daemon socket or API client is used directly.
 *
 * Container IDs are validated to contain only hexadecimal characters
 * before being substituted into shell commands, preventing injection.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DockerServiceImpl implements DockerService {

    private static final Pattern CONTAINER_ID_PATTERN = Pattern.compile("^[a-fA-F0-9]+$");
    private static final Pattern IMAGE_ID_PATTERN = Pattern.compile("^[a-zA-Z0-9_./:@-]+$");

    /*
     * Section separator used when batching multiple docker CLI calls into a single SSH exec.
     */
    private static final String SEP = "---UNIFT_SEP---";

    /*
     * Simple TTL cache: key -> cached value, keyed by sessionId:method.
     * Avoids re-running docker commands that were just executed within the last 30 seconds.
     * Stats use a shorter 15-second window since they change more frequently.
     */
    private static final long CACHE_TTL_MS = 30_000L;
    private static final long STATS_CACHE_TTL_MS = 15_000L;
    private final ConcurrentHashMap<String, long[]> cacheExpiry = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Object> cache = new ConcurrentHashMap<>();

    private final SessionRegistry sessionRegistry;
    private final ObjectMapper objectMapper;

    @Override
    public boolean isDockerAvailable(String sessionId, UUID userId) {
        RemoteShell shell = resolveShell(sessionId, userId);
        try {
            String result = shell.executeCommand("docker info --format '{{.ServerVersion}}' 2>/dev/null");
            return result != null && !result.isBlank() && !result.contains("Cannot connect");
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

        RemoteShell shell = resolveShell(sessionId, userId);
        try {
            String infoJson = exec(
                    shell,
                    "docker info --format '"
                            + "{\"ServerVersion\":\"{{.ServerVersion}}\","
                            + "\"Containers\":{{.Containers}},"
                            + "\"ContainersRunning\":{{.ContainersRunning}},"
                            + "\"ContainersStopped\":{{.ContainersStopped}},"
                            + "\"ContainersPaused\":{{.ContainersPaused}},"
                            + "\"Images\":{{.Images}},"
                            + "\"OSType\":\"{{.OSType}}\","
                            + "\"Driver\":\"{{.Driver}}\"}"
                            + "' 2>/dev/null");

            var node = objectMapper.readTree(infoJson);
            DockerInfo result = DockerInfo.builder()
                    .available(true)
                    .version(node.path("ServerVersion").asText(""))
                    .totalContainers(node.path("Containers").asInt(0))
                    .runningContainers(node.path("ContainersRunning").asInt(0))
                    .stoppedContainers(node.path("ContainersStopped").asInt(0))
                    .pausedContainers(node.path("ContainersPaused").asInt(0))
                    .totalImages(node.path("Images").asInt(0))
                    .serverOs(node.path("OSType").asText(""))
                    .storageDriver(node.path("Driver").asText(""))
                    .build();
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

        RemoteShell shell = resolveShell(sessionId, userId);

        /*
         * Batch docker info, running containers list, and stats into a single SSH exec.
         * The three commands are separated by marker lines so the output can be split
         * and parsed independently — 3 SSH round-trips reduced to 1.
         *
         * Note: docker stats --no-stream itself takes time (Docker polls cgroups once per
         * container), but we at least eliminate two extra SSH connection overheads.
         */
        String infoFmt = "'{\"ServerVersion\":\"{{.ServerVersion}}\","
                + "\"Containers\":{{.Containers}},"
                + "\"ContainersRunning\":{{.ContainersRunning}},"
                + "\"ContainersStopped\":{{.ContainersStopped}},"
                + "\"ContainersPaused\":{{.ContainersPaused}},"
                + "\"Images\":{{.Images}},"
                + "\"OSType\":\"{{.OSType}}\","
                + "\"Driver\":\"{{.Driver}}\"}' 2>/dev/null";
        String statsFmt =
                "'{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}' 2>/dev/null";

        String batchCmd = String.join(
                "; ",
                "docker info --format " + infoFmt,
                "echo '" + SEP + "CMD1'",
                "docker ps --format json 2>/dev/null",
                "echo '" + SEP + "CMD2'",
                "docker stats --no-stream --format " + statsFmt);

        try {
            String raw = exec(shell, batchCmd);
            String[] parts = raw.split(SEP + "CMD\\d+", -1);

            // Section 0: docker info JSON
            DockerInfo info = parseDockerInfoJson(parts.length > 0 ? parts[0].trim() : "");

            // Section 1: docker ps JSON-per-line
            String containerRaw = parts.length > 1 ? parts[1].trim() : "";
            List<Container> running =
                    containerRaw.isEmpty() ? List.of() : parseJsonLines(containerRaw, Container.class);

            // Section 2: docker stats pipe-delimited lines
            String statsRaw = parts.length > 2 ? parts[2].trim() : "";
            List<ContainerStats> stats = parseStatsLines(statsRaw);

            DockerOverview result = DockerOverview.builder()
                    .info(info)
                    .runningContainers(running)
                    .stats(stats)
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

    @Override
    public ContainerPage listContainers(String sessionId, UUID userId, boolean all, int page, int pageSize) {
        String cacheKey = sessionId + ":containers:" + all;
        @SuppressWarnings("unchecked")
        List<Container> allContainers = fromCacheList(cacheKey);
        if (allContainers == null) {
            allContainers = listContainersInternal(sessionId, userId, all);
            putCache(cacheKey, allContainers, CACHE_TTL_MS);
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

        RemoteShell shell = resolveShell(sessionId, userId);
        try {
            String raw = exec(
                    shell,
                    "docker stats --no-stream --format "
                            + "'{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}' "
                            + "2>/dev/null");
            List<ContainerStats> result = parseStatsLines(raw);
            putCache(cacheKey, result, STATS_CACHE_TTL_MS);
            return result;
        } catch (Exception e) {
            log.warn("[docker] Failed to get container stats for session {}: {}", sessionId, e.getMessage());
            return List.of();
        }
    }

    @Override
    public ContainerActionResult startContainer(String sessionId, UUID userId, String containerId) {
        return executeContainerAction(sessionId, userId, containerId, "start");
    }

    @Override
    public ContainerActionResult stopContainer(String sessionId, UUID userId, String containerId) {
        return executeContainerAction(sessionId, userId, containerId, "stop");
    }

    @Override
    public ContainerActionResult restartContainer(String sessionId, UUID userId, String containerId) {
        return executeContainerAction(sessionId, userId, containerId, "restart");
    }

    @Override
    public ContainerActionResult removeContainer(String sessionId, UUID userId, String containerId) {
        return executeContainerAction(sessionId, userId, containerId, "rm");
    }

    @Override
    public String getContainerLogs(String sessionId, UUID userId, String containerId, int tailLines) {
        validateContainerId(containerId);
        RemoteShell shell = resolveShell(sessionId, userId);
        int safeTail = Math.min(Math.max(tailLines, 1), 5000);
        try {
            return exec(shell, "docker logs --tail " + safeTail + " " + containerId + " 2>&1");
        } catch (Exception e) {
            throw new RemoteConnectionException("Failed to retrieve container logs: " + e.getMessage());
        }
    }

    @Override
    public ImagePage listImages(String sessionId, UUID userId) {
        String cacheKey = sessionId + ":images";
        ImagePage cached = fromCache(cacheKey, ImagePage.class);
        if (cached != null) return cached;

        RemoteShell shell = resolveShell(sessionId, userId);
        try {
            String raw = exec(shell, "docker images --format json 2>/dev/null");
            List<DockerImage> images = parseJsonLines(raw, DockerImage.class);
            ImagePage result =
                    ImagePage.builder().images(images).total(images.size()).build();
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
        RemoteShell shell = resolveShell(sessionId, userId);
        try {
            String result = exec(shell, "docker rmi " + imageId + " 2>&1");
            boolean success = !result.toLowerCase().contains("error")
                    && !result.toLowerCase().contains("conflict");
            if (success) invalidateSessionCache(sessionId);
            return ContainerActionResult.builder()
                    .containerId(imageId)
                    .action("remove_image")
                    .success(success)
                    .message(success ? "Image removed" : result)
                    .build();
        } catch (Exception e) {
            return ContainerActionResult.builder()
                    .containerId(imageId)
                    .action("remove_image")
                    .success(false)
                    .message(e.getMessage())
                    .build();
        }
    }

    // -- Internal helpers --

    private List<Container> listContainersInternal(String sessionId, UUID userId, boolean all) {
        RemoteShell shell = resolveShell(sessionId, userId);
        try {
            String cmd = all ? "docker ps -a --format json 2>/dev/null" : "docker ps --format json 2>/dev/null";
            String raw = exec(shell, cmd);
            return parseJsonLines(raw, Container.class);
        } catch (Exception e) {
            log.warn("[docker] Failed to list containers for session {}: {}", sessionId, e.getMessage());
            return List.of();
        }
    }

    private ContainerActionResult executeContainerAction(
            String sessionId, UUID userId, String containerId, String action) {
        validateContainerId(containerId);
        RemoteShell shell = resolveShell(sessionId, userId);
        try {
            String result = exec(shell, "docker " + action + " " + containerId + " 2>&1");
            boolean success = result.trim().equals(containerId)
                    || result.isBlank()
                    || !result.toLowerCase().contains("error");
            if (success) invalidateSessionCache(sessionId);
            return ContainerActionResult.builder()
                    .containerId(containerId)
                    .action(action)
                    .success(success)
                    .message(success ? "Container " + action + " successful" : result)
                    .build();
        } catch (Exception e) {
            return ContainerActionResult.builder()
                    .containerId(containerId)
                    .action(action)
                    .success(false)
                    .message(e.getMessage())
                    .build();
        }
    }

    // -- Cache helpers --

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
        cacheExpiry.put(key, new long[] {System.currentTimeMillis() + ttlMs});
    }

    /*
     * Evicts all cached entries for a session. Called after mutating operations
     * (container start/stop/restart/remove, image remove) so subsequent reads
     * reflect the updated state.
     */
    private void invalidateSessionCache(String sessionId) {
        String prefix = sessionId + ":";
        cache.keySet().removeIf(k -> k.startsWith(prefix));
        cacheExpiry.keySet().removeIf(k -> k.startsWith(prefix));
    }

    // -- Parsing helpers --

    private DockerInfo parseDockerInfoJson(String infoJson) {
        try {
            var node = objectMapper.readTree(infoJson.isEmpty() ? "{}" : infoJson);
            return DockerInfo.builder()
                    .available(true)
                    .version(node.path("ServerVersion").asText(""))
                    .totalContainers(node.path("Containers").asInt(0))
                    .runningContainers(node.path("ContainersRunning").asInt(0))
                    .stoppedContainers(node.path("ContainersStopped").asInt(0))
                    .pausedContainers(node.path("ContainersPaused").asInt(0))
                    .totalImages(node.path("Images").asInt(0))
                    .serverOs(node.path("OSType").asText(""))
                    .storageDriver(node.path("Driver").asText(""))
                    .build();
        } catch (Exception e) {
            return DockerInfo.builder().available(false).build();
        }
    }

    private List<ContainerStats> parseStatsLines(String raw) {
        List<ContainerStats> result = new ArrayList<>();
        if (raw == null || raw.isBlank()) return result;
        for (String line : raw.split("\n")) {
            if (line.isBlank()) continue;
            String[] parts = line.split("\\|", -1);
            if (parts.length < 7) continue;
            result.add(ContainerStats.builder()
                    .containerId(parts[0].trim())
                    .name(parts[1].trim())
                    .cpuPercent(parts[2].trim())
                    .memoryUsage(parts[3].trim().split("/")[0].trim())
                    .memoryLimit(
                            parts[3].trim().contains("/")
                                    ? parts[3].trim().split("/")[1].trim()
                                    : "")
                    .memoryPercent(parts[4].trim())
                    .networkIo(parts[5].trim())
                    .blockIo(parts[6].trim())
                    .build());
        }
        return result;
    }

    /**
     * Resolves the SSH shell for a session, enforcing ownership.
     *
     * @throws RemoteConnectionException if the connection does not support shell execution
     */
    private RemoteShell resolveShell(String sessionId, UUID userId) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        if (!conn.getSession().getOwnerId().equals(userId)) {
            throw new SessionAccessDeniedException("Not authorized for session " + sessionId);
        }
        if (!(conn instanceof RemoteShell shell)) {
            throw new RemoteConnectionException("Session does not support shell execution");
        }
        return shell;
    }

    /**
     * Validates that a container ID contains only hex characters.
     * Prevents shell command injection.
     */
    private void validateContainerId(String containerId) {
        if (containerId == null || !CONTAINER_ID_PATTERN.matcher(containerId).matches()) {
            throw new IllegalArgumentException("Invalid container ID: must be hexadecimal");
        }
    }

    /**
     * Validates that an image ID/reference contains only safe characters.
     * Prevents shell command injection.
     */
    private void validateImageId(String imageId) {
        if (imageId == null || !IMAGE_ID_PATTERN.matcher(imageId).matches()) {
            throw new IllegalArgumentException("Invalid image reference");
        }
    }

    private String exec(RemoteShell shell, String command) throws Exception {
        String result = shell.executeCommand(command);
        return result != null ? result : "";
    }

    /**
     * Parses Docker's JSON-per-line output format into a list of objects.
     * Docker CLI {@code --format json} emits one JSON object per line.
     */
    private <T> List<T> parseJsonLines(String raw, Class<T> type) throws Exception {
        if (raw == null || raw.isBlank()) return List.of();
        List<T> result = new ArrayList<>();
        for (String line : raw.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || !trimmed.startsWith("{")) continue;
            result.add(objectMapper.readValue(trimmed, type));
        }
        return result;
    }
}
