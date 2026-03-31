package com.weekend.architect.unift.remote.docker;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.model.Statistics;
import com.weekend.architect.unift.remote.exception.SessionAccessDeniedException;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import java.io.Closeable;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Streams live Docker container stats (CPU, memory, network I/O) to a browser
 * via Server-Sent Events (SSE).
 *
 * <p>Each stream feeds Docker Engine {@code /containers/{id}/stats} data through
 * a docker-java {@link ResultCallback} and pushes computed metrics as SSE events.
 *
 * <p>SSE event types: {@code stats}, {@code end}, {@code error}.
 */
@Slf4j
@Service
public class DockerStatsStreamService {

    private final ExecutorService executor;
    private final DockerClientPool dockerClientPool;
    private final SessionRegistry sessionRegistry;
    private final ConcurrentHashMap<String, StatsStreamEntry> streams = new ConcurrentHashMap<>();

    public DockerStatsStreamService(
            SessionRegistry sessionRegistry,
            DockerClientPool dockerClientPool,
            @Qualifier("virtualThreadExecutor") ExecutorService executor) {
        this.executor = executor;
        this.sessionRegistry = sessionRegistry;
        this.dockerClientPool = dockerClientPool;
    }

    /**
     * Opens a live stats stream for a single container.
     *
     * @param sessionId   UniFT session ID
     * @param userId      authenticated user
     * @param containerId Docker container ID or name
     */
    public SseEmitter streamContainerStats(String sessionId, UUID userId, String containerId) {
        var conn = sessionRegistry.require(sessionId);
        if (!conn.getSession().getOwnerId().equals(userId)) {
            throw new SessionAccessDeniedException("Not authorized for session " + sessionId);
        }

        DockerClient client = dockerClientPool.resolveForSession(sessionId, conn);
        String streamId = "stats:" + sessionId + ":" + containerId;

        closeStream(streamId);

        SseEmitter emitter = new SseEmitter(30 * 60 * 1000L);

        try {
            ResultCallback.Adapter<Statistics> callback = new ResultCallback.Adapter<>() {
                @Override
                public void onNext(Statistics stats) {
                    DockerModels.ContainerStats computed = computeStats(containerId, stats);
                    trySend(emitter, SseEmitter.event().name("stats").data(computed));
                }
            };

            client.statsCmd(containerId).exec(callback);
            streams.put(streamId, new StatsStreamEntry(emitter, callback));

            emitter.onCompletion(() -> closeStream(streamId));
            emitter.onTimeout(() -> closeStream(streamId));
            emitter.onError(e -> closeStream(streamId));

            executor.submit(() -> awaitAndFinalize(callback, emitter, streamId));

            log.info("[docker-stats] Started stats stream {}", streamId);
        } catch (Exception e) {
            log.warn("[docker-stats] Failed to start stats stream for {}: {}", containerId, e.getMessage());
            sendError(emitter, e.getMessage());
        }

        return emitter;
    }

    /** Closes all stats streams belonging to the given session. */
    public void closeAllBySession(String sessionId) {
        String prefix = "stats:" + sessionId + ":";
        List<String> toClose = new ArrayList<>();
        for (String key : streams.keySet()) {
            if (key.startsWith(prefix)) toClose.add(key);
        }
        toClose.forEach(this::closeStream);
    }

    private void closeStream(String streamId) {
        StatsStreamEntry entry = streams.remove(streamId);
        if (entry != null) {
            try { entry.callback.close(); } catch (Exception ignored) {}
            try { entry.emitter.complete(); } catch (Exception ignored) {}
            log.debug("[docker-stats] Closed stream {}", streamId);
        }
    }

    private void awaitAndFinalize(
            ResultCallback.Adapter<Statistics> callback, SseEmitter emitter, String streamId) {
        try {
            callback.awaitCompletion();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            trySend(emitter, SseEmitter.event().name("end").data("stats stream ended"));
            try { emitter.complete(); } catch (Exception ignored) {}
            streams.remove(streamId);
        }
    }

    /**
     * Computes user-friendly metrics from raw Docker Statistics.
     * CPU percentage follows the same formula as {@code docker stats} CLI.
     */
    static DockerModels.ContainerStats computeStats(String containerId, Statistics stats) {
        double cpuPercent = 0.0;
        if (stats.getCpuStats() != null && stats.getPreCpuStats() != null
                && stats.getCpuStats().getCpuUsage() != null
                && stats.getPreCpuStats().getCpuUsage() != null
                && stats.getCpuStats().getSystemCpuUsage() != null
                && stats.getPreCpuStats().getSystemCpuUsage() != null) {
            long cpuDelta = stats.getCpuStats().getCpuUsage().getTotalUsage()
                    - stats.getPreCpuStats().getCpuUsage().getTotalUsage();
            long sysDelta = stats.getCpuStats().getSystemCpuUsage()
                    - stats.getPreCpuStats().getSystemCpuUsage();
            int numCpus = stats.getCpuStats().getCpuUsage().getPercpuUsage() != null
                    ? stats.getCpuStats().getCpuUsage().getPercpuUsage().size() : 1;
            if (sysDelta > 0 && cpuDelta >= 0) {
                cpuPercent = ((double) cpuDelta / sysDelta) * numCpus * 100.0;
            }
        }

        long memUsage = stats.getMemoryStats() != null && stats.getMemoryStats().getUsage() != null
                ? stats.getMemoryStats().getUsage() : 0;
        long memLimit = stats.getMemoryStats() != null && stats.getMemoryStats().getLimit() != null
                ? stats.getMemoryStats().getLimit() : 0;
        double memPercent = memLimit > 0 ? ((double) memUsage / memLimit) * 100.0 : 0.0;

        long netRx = 0, netTx = 0;
        if (stats.getNetworks() != null) {
            for (var net : stats.getNetworks().values()) {
                netRx += net.getRxBytes();
                netTx += net.getTxBytes();
            }
        }

        return DockerModels.ContainerStats.builder()
                .containerId(containerId)
                .name(containerId)
                .cpuPercent(Math.round(cpuPercent * 100.0) / 100.0)
                .memoryUsage(memUsage)
                .memoryLimit(memLimit)
                .memoryPercent(Math.round(memPercent * 100.0) / 100.0)
                .networkRx(netRx)
                .networkTx(netTx)
                .pids(stats.getPidsStats() != null && stats.getPidsStats().getCurrent() != null
                        ? stats.getPidsStats().getCurrent().intValue() : 0)
                .build();
    }

    private void sendError(SseEmitter emitter, String message) {
        trySend(emitter, SseEmitter.event()
                .name("error")
                .data(Map.of("message", message != null ? message : "Unknown error")));
        try { emitter.complete(); } catch (Exception ignored) {}
    }

    private void trySend(SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IllegalStateException | IOException ignored) {
        }
    }

    private record StatsStreamEntry(SseEmitter emitter, Closeable callback) {}
}
