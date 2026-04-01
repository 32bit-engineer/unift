package com.weekend.architect.unift.common.cache.model;

import com.weekend.architect.unift.common.cache.RegistryCache;
import com.weekend.architect.unift.common.cache.config.RegistryCacheConfig;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Externalized configuration for every {@link RegistryCache} instance managed by {@link
 * RegistryCacheConfig}.
 *
 * <p>All properties live under the {@code unift.cache.*} prefix in {@code application.yaml}.
 * Defaults match the previous hardcoded values so existing deployments are not affected.
 *
 * <h6>Adding a new cache</h6>
 *
 * <ol>
 *   <li>Add a {@link CacheSpec} field here (e.g. {@code private CacheSpec myNewCache = new
 *       CacheSpec(10_000L);})
 *   <li>Add the corresponding YAML entry ({@code unift.cache.my-new-cache.max-size: ...})
 *   <li>Create the named-cache class and {@code @Bean} in {@link RegistryCacheConfig}
 * </ol>
 */
@Data
@Component
@ConfigurationProperties(prefix = "unift.cache")
public class CacheProperties {

    /** SSH / SFTP connection registry. */
    private CacheSpec sshConnection = new CacheSpec(10_000L);

    /** WebSocket terminal session registry. */
    private CacheSpec terminalSession = new CacheSpec(10_000L);

    /**
     * File-transfer registry. Larger cap because multiple transfers can be in flight per session;
     * terminal-state entries are TTL-evicted by the service layer.
     */
    private CacheSpec transfer = new CacheSpec(100_000L);

    /** Per-session bandwidth / activity metrics. */
    private CacheSpec metrics = new CacheSpec(10_000L);

    /** Fabric8 KubernetesClient pool — one entry per active SSH session with k8s. */
    private CacheSpec k8sClient = new CacheSpec(500L);

    /** docker-java DockerClient pool — one entry per active SSH session with Docker. */
    private CacheSpec dockerClient = new CacheSpec(100L);

    /**
     * Configuration for a single cache instance.
     *
     * <p>Extend this class when cache-specific knobs are needed (e.g. {@code statsEnabled}, {@code
     * softValues}) rather than adding them to every named cache class.
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CacheSpec {

        /**
         * Maximum number of entries before the W-TinyLFU eviction policy kicks in. Set generously —
         * this is a safety cap, not a target working-set size.
         */
        private long maxSize;
    }
}
