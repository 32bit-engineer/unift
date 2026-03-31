package com.weekend.architect.unift.remote.docker;

import java.io.Closeable;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Tracks every live Docker container log SSE stream.
 *
 * <p>Streams are keyed by {@code sessionId:containerId}. Two cleanup paths:
 * <ol>
 *   <li><b>Client-initiated</b> — browser closes EventSource, Spring fires
 *       {@link SseEmitter#onCompletion}, which calls {@link #close(String)}.</li>
 *   <li><b>Server-initiated</b> — SSH session expires or is removed, calling
 *       {@link #closeAllBySession(String)} to tear down every open stream.</li>
 * </ol>
 */
@Slf4j
@Component
public class DockerLogStreamRegistry {

    private final ConcurrentHashMap<String, LogStreamEntry> streams = new ConcurrentHashMap<>();

    /**
     * Registers a new log stream.
     *
     * @param streamId    composite key ({@code sessionId:containerId})
     * @param emitter     the SSE emitter pushing data to the browser
     * @param logCallback the docker-java callback (Closeable) that feeds log frames
     */
    public void register(String streamId, SseEmitter emitter, Closeable logCallback) {
        streams.put(streamId, new LogStreamEntry(emitter, logCallback));
        log.debug("[docker-log] Registered stream {}", streamId);
    }

    /** Closes a single stream. Safe to call multiple times (idempotent). */
    public void close(String streamId) {
        LogStreamEntry entry = streams.remove(streamId);
        if (entry != null) {
            log.info("[docker-log] Closing stream {}", streamId);
            entry.close();
        }
    }

    /**
     * Closes all log streams belonging to the given SSH session.
     * Called when the session expires or is explicitly disconnected.
     */
    public void closeAllBySession(String sessionId) {
        String prefix = sessionId + ":";
        List<String> toClose = new ArrayList<>();
        for (String key : streams.keySet()) {
            if (key.startsWith(prefix)) toClose.add(key);
        }
        toClose.forEach(this::close);
        if (!toClose.isEmpty()) {
            log.info("[docker-log] Closed {} stream(s) for session {}", toClose.size(), sessionId);
        }
    }

    record LogStreamEntry(SseEmitter emitter, Closeable logCallback) {
        void close() {
            // Close the docker-java callback first so the reader/callback unblocks.
            try {
                logCallback.close();
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
