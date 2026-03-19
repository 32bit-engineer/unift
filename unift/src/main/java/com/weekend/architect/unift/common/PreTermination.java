package com.weekend.architect.unift.common;

import com.weekend.architect.unift.remote.registry.SessionRegistry;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.ExecutorService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

@Component
public class PreTermination {

    private final ExecutorService platformThreadExecutor;
    private final ExecutorService virtualThreadExecutor;
    private final SessionRegistry sessionRegistry;

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
        this.virtualThreadExecutor.shutdown();
        this.platformThreadExecutor.shutdown();
        this.sessionRegistry.clearAllSessions();
    }
}
