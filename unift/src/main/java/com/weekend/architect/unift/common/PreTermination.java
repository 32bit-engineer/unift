package com.weekend.architect.unift.common;

import com.weekend.architect.unift.remote.registry.SessionRegistry;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

/**
 * Coordinates orderly shutdown of executor pools and SSH sessions.
 *
 * <h6>Thread ownership</h6>
 * <ul>
 *   <li><b>virtualThreadExecutor</b> — terminal pipe loops ({@code pipeShellToWebSocket})
 *       and analytics parallel probes.  Pipe loops block on {@code stdout.read()} and will
 *       only exit after the underlying SSH session is closed.</li>
 *   <li><b>platformThreadExecutor</b> — BCrypt hashing (auth service).  Tasks are
 *       short-lived (&lt; 1 s) and finish well within the drain window.</li>
 *   <li><b>Spring's own servlet / async threads</b> — SFTP stream uploads and
 *       {@link org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody}
 *       downloads run here and are <em>not</em> owned by our executors.  They are drained
 *       by Spring Boot's graceful shutdown ({@code server.shutdown=graceful}) which stops
 *       the servlet container and waits for in-flight HTTP requests to complete
 *       <em>before</em> any {@code @PreDestroy} method is called.  By the time
 *       {@link #destroy()} runs, all SFTP transfers are already finished.</li>
 * </ul>
 *
 * <h6>Shutdown sequence</h6>
 * <ol>
 *   <li>Stop accepting new tasks on both executors.</li>
 *   <li>Close all SSH sessions — this is the signal that unblocks terminal pipe threads
 *       (their {@code read()} returns EOF) and cuts any residual SFTP streams.</li>
 *   <li>Await executor drain — pipe threads can now finish quickly because their streams
 *       are closed.  BCrypt tasks finish on their own.</li>
 *   <li>Force-interrupt any stragglers if the window expires.</li>
 * </ol>
 */
@Slf4j
@Component
public class PreTermination {

    private final SessionRegistry sessionRegistry;
    private final ExecutorService platformThreadExecutor;
    private final ExecutorService virtualThreadExecutor;

    public PreTermination(
            @Qualifier("platformThreadExecutor") ExecutorService platformThreadExecutor,
            @Qualifier("virtualThreadExecutor") ExecutorService virtualThreadExecutor,
            SessionRegistry sessionRegistry) {
        this.platformThreadExecutor = platformThreadExecutor;
        this.virtualThreadExecutor = virtualThreadExecutor;
        this.sessionRegistry = sessionRegistry;
    }

    @PreDestroy
    public void destroy() {
        log.info("[shutdown] Starting graceful shutdown sequence");

        // Step 1 — stop accepting new tasks.
        virtualThreadExecutor.shutdown();
        platformThreadExecutor.shutdown();

        // Step 2 — close all SSH sessions BEFORE awaiting executor termination.
        //
        // Terminal pipe threads are blocked on ChannelShell.stdout.read().
        // They only exit when their SSH session (and its ChannelShell) is closed.
        // Closing sessions here gives those threads an EOF signal so they can
        // exit cleanly within the drain window below.
        //
        // Any residual SFTP channel open on a Spring servlet thread is also cut here.
        // Spring's graceful shutdown has already drained in-flight HTTP requests before
        // this method is called, so no active upload/download should still be running.
        log.info("[shutdown] Closing all SSH sessions");
        sessionRegistry.clearAllSessions();

        // Step 3 — await orderly drain now that streams are closed.
        awaitTermination();

        log.info("[shutdown] Graceful shutdown complete");
    }

    private void awaitTermination() {
        try {
            if (!virtualThreadExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
                log.warn("[shutdown] Virtual-thread executor did not drain in 10 s — forcing shutdown");
                virtualThreadExecutor.shutdownNow();
            }
            if (!platformThreadExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
                log.warn("[shutdown] Platform-thread executor did not drain in 10 s — forcing shutdown");
                platformThreadExecutor.shutdownNow();
            }
        } catch (InterruptedException iex) {
            log.warn("[shutdown] interrupted: {}", iex.getMessage());
            log.warn("[shutdown] Interrupted while waiting for executor drain — forcing shutdown");
            virtualThreadExecutor.shutdownNow();
            platformThreadExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
