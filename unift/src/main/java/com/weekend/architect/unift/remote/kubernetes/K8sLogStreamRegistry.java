package com.weekend.architect.unift.remote.kubernetes;

import com.weekend.architect.unift.remote.registry.SessionRegistry;
import io.fabric8.kubernetes.client.dsl.LogWatch;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Tracks every live pod-log SSE stream.
 *
 * <p>Streams are keyed by {@code sessionId:namespace:podName[:container]}. Two cleanup paths exist:
 *
 * <ol>
 *   <li><b>Client-initiated</b> — the browser closes the EventSource connection. Spring fires
 *       {@link SseEmitter#onCompletion}/{@link SseEmitter#onError}, which call {@link
 *       #close(String)}.
 *   <li><b>Server-initiated</b> — the parent SSH session expires or is explicitly removed. {@link
 *       SessionRegistry} calls {@link #closeAllBySession(String)}, which tears down every stream
 *       that belongs to that session.
 * </ol>
 */
@Slf4j
@Component
public class K8sLogStreamRegistry {

    private final ConcurrentHashMap<String, LogStreamEntry> streams = new ConcurrentHashMap<>();

    public void register(String streamId, SseEmitter emitter, LogWatch logWatch) {
        streams.put(streamId, new LogStreamEntry(emitter, logWatch));
        log.debug("[k8s-log] Registered stream {}", streamId);
    }

    /** Closes a single stream. Safe to call multiple times (idempotent). */
    public void close(String streamId) {
        LogStreamEntry entry = streams.remove(streamId);
        if (entry != null) {
            log.info("[k8s-log] Closing stream {}", streamId);
            entry.close();
        }
    }

    /**
     * Closes all log streams that belong to the given SSH session. Called automatically when the
     * session expires or is disconnected.
     */
    public void closeAllBySession(String sessionId) {
        String prefix = sessionId + ":";
        List<String> toClose = new ArrayList<>();
        for (String key : streams.keySet()) {
            if (key.startsWith(prefix)) toClose.add(key);
        }
        toClose.forEach(this::close);
        if (!toClose.isEmpty()) {
            log.info("[k8s-log] Closed {} log stream(s) for session {}", toClose.size(), sessionId);
        }
    }

    record LogStreamEntry(SseEmitter emitter, LogWatch logWatch) {
        void close() {
            // Close the Fabric8 log watch first — this causes the reader thread's
            // readLine() to return null / throw, which unblocks the virtual thread.
            try {
                logWatch.close();
            } catch (Exception ignored) {
            }
            // Complete the emitter so Spring flushes and closes the HTTP response.
            try {
                emitter.complete();
            } catch (Exception ignored) {
            }
        }
    }
}
