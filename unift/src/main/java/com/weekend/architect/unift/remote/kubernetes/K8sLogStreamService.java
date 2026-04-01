package com.weekend.architect.unift.remote.kubernetes;

import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.exception.RemoteConnectionException;
import com.weekend.architect.unift.remote.exception.SessionAccessDeniedException;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.dsl.LogWatch;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Streams live Kubernetes pod logs to a browser via Server-Sent Events (SSE).
 *
 * <h6>Data flow</h6>
 *
 * <pre>
 *   Browser EventSource ── HTTP GET ──▶ SseEmitter
 *                                          │
 *                             virtual thread reads lines
 *                                          │
 *                            Fabric8 LogWatch (follow=true)
 *                                          │
 *                             k8s API server /pods/{name}/log
 * </pre>
 *
 * <h6>SSE event types emitted</h6>
 *
 * <ul>
 *   <li>{@code log} — a single log line (plain text)
 *   <li>{@code end} — stream finished naturally (pod stopped / container exited)
 *   <li>{@code error} — JSON {@code {"message":"..."}}; stream then completes
 * </ul>
 *
 * <h6>Lifecycle / cleanup</h6>
 *
 * <ul>
 *   <li><b>Client closes the panel</b> → EventSource fires {@code close()} → Spring invokes {@link
 *       SseEmitter#onCompletion} → we call {@link K8sLogStreamRegistry#close(String)} → Fabric8
 *       LogWatch closed → virtual thread unblocks and exits.
 *   <li><b>SSH session expires</b> → {@link SessionRegistry#remove} → {@link
 *       K8sLogStreamRegistry#closeAllBySession} shuts down every open stream for that session.
 * </ul>
 *
 * <h6>Virtual threads</h6>
 *
 * <p>Each stream reads its log lines on a Project Loom virtual thread ({@link
 * Executors#newVirtualThreadPerTaskExecutor()}). Blocking on {@code readLine()} is cheap — virtual
 * threads park without consuming a platform thread while waiting for new log output.
 */
@Slf4j
@Service
public class K8sLogStreamService {

    private final ExecutorService executor;
    private final K8sClientPool k8sClientPool;
    private final SessionRegistry sessionRegistry;
    private final K8sLogStreamRegistry streamRegistry;

    public K8sLogStreamService(
            SessionRegistry sessionRegistry,
            K8sClientPool k8sClientPool,
            K8sLogStreamRegistry streamRegistry,
            @Qualifier("virtualThreadExecutor") ExecutorService executor) {
        this.executor = executor;
        this.sessionRegistry = sessionRegistry;
        this.k8sClientPool = k8sClientPool;
        this.streamRegistry = streamRegistry;
    }

    /**
     * Opens a live log stream for the specified pod and returns an {@link SseEmitter} that will
     * push log lines to the connected browser.
     *
     * @param sessionId UniFT session ID
     * @param userId authenticated user
     * @param namespace pod namespace
     * @param podName pod name
     * @param container optional container name (null → Kubernetes default container)
     * @param tailLines number of historical lines to replay before following
     */
    public SseEmitter streamPodLogs(
            String sessionId, UUID userId, String namespace, String podName, String container, int tailLines) {

        RemoteConnection conn = sessionRegistry.require(sessionId);
        if (!conn.getSession().getOwnerId().equals(userId)) {
            throw new SessionAccessDeniedException("Not authorized for session " + sessionId);
        }
        if (!(conn instanceof RemoteShell shell)) {
            throw new RemoteConnectionException("Session does not support shell execution");
        }

        KubernetesClient client = k8sClientPool.resolveForSession(sessionId, shell);
        String ns = (namespace == null || namespace.isBlank()) ? "default" : namespace;
        int safeTail = Math.max(1, Math.min(tailLines, 5_000));
        String streamId = buildStreamId(sessionId, ns, podName, container);

        // Replace any existing stream for the same pod (e.g. user re-opened the panel)
        streamRegistry.close(streamId);

        // Long.MAX_VALUE = no server-side timeout; the emitter lives until
        // the client disconnects, or we explicitly complete it.
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);

        try {
            LogWatch logWatch = buildLogWatch(client, ns, podName, container, safeTail);

            streamRegistry.register(streamId, emitter, logWatch);

            // All three callbacks call the same cleanup — whichever fires first wins.
            emitter.onCompletion(() -> streamRegistry.close(streamId));
            emitter.onTimeout(() -> streamRegistry.close(streamId));
            emitter.onError(e -> streamRegistry.close(streamId));

            // Read lines on a virtual thread so we never block a platform carrier thread.
            executor.submit(() -> readAndStream(emitter, logWatch, streamId, podName));

            log.info(
                    "[k8s-log] Started log stream {} (tail={}, container={})",
                    streamId,
                    safeTail,
                    container != null ? container : "<default>");

        } catch (Exception e) {
            log.warn("[k8s-log] Failed to start log stream for {}/{}: {}", ns, podName, e.getMessage());
            sendError(emitter, e.getMessage());
        }

        return emitter;
    }

    private LogWatch buildLogWatch(KubernetesClient client, String ns, String podName, String container, int tail) {
        var base = client.pods().inNamespace(ns).withName(podName);
        if (container != null && !container.isBlank()) {
            return base.inContainer(container).tailingLines(tail).watchLog();
        }
        return base.tailingLines(tail).watchLog();
    }

    /** Runs on a virtual thread — blocks reading lines until the stream ends. */
    private void readAndStream(SseEmitter emitter, LogWatch logWatch, String streamId, String podName) {
        try (var reader = new BufferedReader(new InputStreamReader(logWatch.getOutput(), StandardCharsets.UTF_8))) {

            String line;
            while ((line = reader.readLine()) != null) {
                if (Thread.currentThread().isInterrupted()) break;
                try {
                    // name=log keeps the frontend listener tidy: source.addEventListener('log',
                    // ...)
                    emitter.send(SseEmitter.event().name("log").data(line));
                } catch (IllegalStateException | IOException e) {
                    // Client disconnected — exit the loop quietly
                    log.debug("[k8s-log] Stream {} client disconnected: {}", streamId, e.getMessage());
                    break;
                }
            }

            // Stream drained naturally (pod stopped, container exited, etc.)
            trySend(emitter, SseEmitter.event().name("end").data("stream ended"));
            emitter.complete();

        } catch (IOException e) {
            // LogWatch.close() was called (session expiry / user closed panel) —
            // the read throws; we just exit cleanly.
            if (!Thread.currentThread().isInterrupted()) {
                log.debug("[k8s-log] Stream {} closed: {}", streamId, e.getMessage());
            }
            trySend(emitter, SseEmitter.event().name("end").data("stream closed"));
            try {
                emitter.complete();
            } catch (Exception ignored) {
            }
        } finally {
            // Belt-and-suspenders: make sure registry entry is gone
            streamRegistry.close(streamId);
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
        } catch (Exception ignored) {
        }
    }

    private String buildStreamId(String sessionId, String ns, String podName, String container) {
        String base = sessionId + ":" + ns + ":" + podName;
        return (container != null && !container.isBlank()) ? base + ":" + container : base;
    }
}
