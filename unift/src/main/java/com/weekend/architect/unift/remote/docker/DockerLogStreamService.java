package com.weekend.architect.unift.remote.docker;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.model.Frame;
import com.weekend.architect.unift.remote.exception.SessionAccessDeniedException;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Streams live Docker container logs to a browser via Server-Sent Events (SSE).
 *
 * <pre>
 *   Browser EventSource -- HTTP GET --&gt; SseEmitter
 *                                          |
 *                          docker-java ResultCallback&lt;Frame&gt;
 *                                          |
 *                          Docker Engine API /containers/{id}/logs
 * </pre>
 *
 * <p>SSE event types emitted:
 *
 * <ul>
 *   <li>{@code log} — a single log line (plain text)
 *   <li>{@code end} — stream finished naturally (container stopped / exited)
 *   <li>{@code error} — JSON {@code {"message":"..."}}; stream then completes
 * </ul>
 *
 * <p>Each stream awaits completion on a Project Loom virtual thread so blocking is cheap and does
 * not consume a platform carrier thread.
 */
@Slf4j
@Service
public class DockerLogStreamService {

    private final ExecutorService executor;
    private final DockerClientPool dockerClientPool;
    private final SessionRegistry sessionRegistry;
    private final DockerLogStreamRegistry streamRegistry;

    public DockerLogStreamService(
            SessionRegistry sessionRegistry,
            DockerClientPool dockerClientPool,
            DockerLogStreamRegistry streamRegistry,
            @Qualifier("virtualThreadExecutor") ExecutorService executor) {
        this.executor = executor;
        this.sessionRegistry = sessionRegistry;
        this.dockerClientPool = dockerClientPool;
        this.streamRegistry = streamRegistry;
    }

    /**
     * Opens a live log stream for the specified container and returns an SSE emitter.
     *
     * @param sessionId UniFT session ID
     * @param userId authenticated user
     * @param containerId Docker container ID or name
     * @param tailLines number of historical lines to replay before following
     * @param timestamps whether to prefix each line with a timestamp
     */
    public SseEmitter streamContainerLogs(
            String sessionId, UUID userId, String containerId, int tailLines, boolean timestamps) {

        var conn = sessionRegistry.require(sessionId);
        if (!conn.getSession().getOwnerId().equals(userId)) {
            throw new SessionAccessDeniedException("Not authorized for session " + sessionId);
        }

        DockerClient client = dockerClientPool.resolveForSession(sessionId, conn);
        int safeTail = Math.max(1, Math.min(tailLines, 5_000));
        String streamId = sessionId + ":" + containerId;

        // Replace any existing stream for the same container (e.g. user re-opened
        // panel)
        streamRegistry.close(streamId);

        SseEmitter emitter = new SseEmitter(30 * 60 * 1000L);

        try {
            ResultCallback.Adapter<Frame> callback = new ResultCallback.Adapter<>() {
                @Override
                public void onNext(Frame frame) {
                    if (frame.getPayload() == null) return;
                    String line = new String(frame.getPayload(), StandardCharsets.UTF_8).stripTrailing();
                    trySend(emitter, SseEmitter.event().name("log").data(line));
                }
            };

            client.logContainerCmd(containerId)
                    .withFollowStream(true)
                    .withStdOut(true)
                    .withStdErr(true)
                    .withTail(safeTail)
                    .withTimestamps(timestamps)
                    .exec(callback);

            streamRegistry.register(streamId, emitter, callback);

            emitter.onCompletion(() -> streamRegistry.close(streamId));
            emitter.onTimeout(() -> streamRegistry.close(streamId));
            emitter.onError(e -> streamRegistry.close(streamId));

            // Virtual thread waits for stream to end naturally (container stop / exit)
            executor.submit(() -> awaitAndFinalize(callback, emitter, streamId, containerId));

            log.info("[docker-log] Started log stream {} (tail={}, timestamps={})", streamId, safeTail, timestamps);

        } catch (Exception e) {
            log.warn("[docker-log] Failed to start log stream for {}: {}", containerId, e.getMessage());
            sendError(emitter, e.getMessage());
        }

        return emitter;
    }

    /** Blocks on a virtual thread until the docker-java callback completes, then finalizes. */
    private void awaitAndFinalize(
            ResultCallback.Adapter<Frame> callback, SseEmitter emitter, String streamId, String containerId) {
        try {
            callback.awaitCompletion();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.debug("[docker-log] Stream {} interrupted", streamId);
        } finally {
            trySend(emitter, SseEmitter.event().name("end").data("stream ended"));
            try {
                emitter.complete();
            } catch (Exception ignored) {
            }
            streamRegistry.close(streamId);
            log.debug("[docker-log] Stream {} finalized for container {}", streamId, containerId);
        }
    }

    private void sendError(SseEmitter emitter, String message) {
        trySend(
                emitter,
                SseEmitter.event().name("error").data(Map.of("message", message != null ? message : "Unknown error")));
        try {
            emitter.complete();
        } catch (Exception ignored) {
        }
    }

    private void trySend(SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IllegalStateException | IOException ignored) {
            // Client disconnected or emitter already completed
        }
    }
}
