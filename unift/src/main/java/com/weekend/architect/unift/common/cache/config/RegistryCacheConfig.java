package com.weekend.architect.unift.common.cache.config;

import com.weekend.architect.unift.common.cache.DelegatingRegistryCache;
import com.weekend.architect.unift.common.cache.RegistryCache;
import com.weekend.architect.unift.common.cache.model.CacheProperties;
import com.weekend.architect.unift.common.cache.namedcache.MetricsCache;
import com.weekend.architect.unift.common.cache.namedcache.SshConnectionCache;
import com.weekend.architect.unift.common.cache.namedcache.TerminalSessionCache;
import com.weekend.architect.unift.common.cache.namedcache.TransferCache;
import com.weekend.architect.unift.common.cache.type.CaffeineRegistryCache;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Single source of truth for every {@link RegistryCache} bean in the application.
 *
 * <h6>Why a central factory?</h6>
 * <p>Rather than having each named-cache class hard-code its own
 * {@code CaffeineRegistryCache.bounded(N)}, all construction decisions live here:
 * <ul>
 *   <li><b>Configuration</b> — max-sizes are read from {@link CacheProperties}
 *       (externalized to {@code application.yaml}), so they are tunable at deploy-time
 *       without touching code.</li>
 *   <li><b>Backend</b> — the {@code CaffeineRegistryCache} call is in one place per
 *       cache.  Switching a cache to Redis means updating a single {@code @Bean}
 *       method, not hunting across multiple files.</li>
 *   <li><b>Observability</b> — Caffeine's {@code .recordStats()} (or any cross-cutting
 *       concern) can be toggled here for all caches at once.</li>
 * </ul>
 *
 * <h6>Adding a new cache tomorrow</h6>
 * <ol>
 *   <li>Create the named-cache class extending {@link DelegatingRegistryCache}
 *       (no {@code @Component}, constructor accepts {@code RegistryCache<K,V> delegate}).</li>
 *   <li>Add a {@link CacheProperties.CacheSpec}
 *       field to {@link CacheProperties} and the matching YAML entry.</li>
 *   <li>Add a {@code @Bean} method below — 3 lines.</li>
 * </ol>
 * <p>Nothing else changes.
 *
 * <h6>Note on MetricsCache</h6>
 * <p>{@link MetricsCache} wraps the package-private {@code SessionMetrics} type.
 * Its constructor therefore accepts a {@code long maxSize} (the Caffeine cache is
 * constructed inside {@code MetricsCache} where {@code SessionMetrics} is in scope).
 * When Redis support for metrics is added, {@code SessionMetrics} must be made
 * {@code public} and the constructor updated to accept a
 * {@code RegistryCache<String, SessionMetrics>} delegate — at which point the
 * {@code metricsCache()} bean below can pass a {@code RedisRegistryCache} directly.
 */
@Configuration
@RequiredArgsConstructor
public class RegistryCacheConfig {

    private final CacheProperties props;

    @Bean
    public SshConnectionCache sshConnectionCache() {
        return new SshConnectionCache(
                CaffeineRegistryCache.bounded(props.getSshConnection().getMaxSize()));
    }

    @Bean
    public TerminalSessionCache terminalSessionCache() {
        return new TerminalSessionCache(
                CaffeineRegistryCache.bounded(props.getTerminalSession().getMaxSize()));
    }

    @Bean
    public TransferCache transferCache() {
        return new TransferCache(
                CaffeineRegistryCache.bounded(props.getTransfer().getMaxSize()));
    }

    /**
     * MetricsCache is constructed with only {@code maxSize} because the value type
     * ({@code SessionMetrics}) is package-private in the {@code analytics} package.
     * The Caffeine backend is created inside {@link MetricsCache} where the type
     * is accessible.
     */
    @Bean
    public MetricsCache metricsCache() {
        return new MetricsCache(props.getMetrics().getMaxSize());
    }
}
