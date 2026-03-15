package com.weekend.architect.unift.remote.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.servlet.config.annotation.AsyncSupportConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Configuration for the remote-connection feature.
 *
 * <ul>
 *   <li>{@code @EnableScheduling} activates the {@code SessionReaper} cron.</li>
 *   <li>{@link WebMvcConfigurer#configureAsyncSupport} sets a generous async
 *       timeout so that large-file streaming downloads are not killed mid-stream.</li>
 * </ul>
 */
@Configuration
@EnableScheduling
public class RemoteConnectionConfig implements WebMvcConfigurer {

    /** 4-hour async timeout – covers even very large file transfers at low speed. */
    private static final long ASYNC_TIMEOUT_MS = 4L * 60 * 60 * 1000;

    @Override
    public void configureAsyncSupport(AsyncSupportConfigurer configurer) {
        configurer.setDefaultTimeout(ASYNC_TIMEOUT_MS);
    }
}
