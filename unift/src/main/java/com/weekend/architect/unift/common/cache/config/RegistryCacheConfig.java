package com.weekend.architect.unift.common.cache.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.weekend.architect.unift.common.cache.DelegatingRegistryCache;
import com.weekend.architect.unift.common.cache.RegistryCache;
import com.weekend.architect.unift.common.cache.model.CacheProperties;
import com.weekend.architect.unift.common.cache.namedcache.MetricsCache;
import com.weekend.architect.unift.common.cache.namedcache.SshConnectionCache;
import com.weekend.architect.unift.common.cache.namedcache.TerminalSessionCache;
import com.weekend.architect.unift.common.cache.namedcache.TransferCache;
import com.weekend.architect.unift.common.cache.type.CaffeineRegistryCache;
import com.weekend.architect.unift.common.cache.type.RedisCache;
import com.weekend.architect.unift.remote.docker.DockerClientCache;
import com.weekend.architect.unift.remote.kubernetes.K8sClientCache;
import com.weekend.architect.unift.remote.model.RemoteTransfer;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * Single source of truth for every {@link RegistryCache} bean in the application.
 *
 * <h6>Why a central factory?</h6>
 *
 * <p>Rather than having each named-cache class hard-code its own {@code
 * CaffeineRegistryCache.bounded(N)}, all construction decisions live here:
 *
 * <ul>
 *   <li><b>Configuration</b> — max-sizes are read from {@link CacheProperties} (externalized to
 *       {@code application.yaml}), so they are tunable at deploy-time without touching code.
 *   <li><b>Backend</b> — the {@code CaffeineRegistryCache} call is in one place per cache.
 *       Switching a cache to Redis means updating a single {@code @Bean} method, not hunting across
 *       multiple files.
 *   <li><b>Observability</b> — Caffeine's {@code .recordStats()} (or any cross-cutting concern) can
 *       be toggled here for all caches at once.
 * </ul>
 *
 * <h6>Adding a new cache tomorrow</h6>
 *
 * <ol>
 *   <li>Create the named-cache class extending {@link DelegatingRegistryCache}. If the value type
 *       is publicly visible, use the delegate constructor pattern (see {@link SshConnectionCache}).
 *       If the value type is package-private, use the maxSize constructor pattern so the Caffeine
 *       backend is built inside the named-cache class where the type is in scope (see {@link
 *       MetricsCache} and {@link K8sClientCache}).
 *   <li>Add a {@link CacheProperties.CacheSpec} field to {@link CacheProperties} and the matching
 *       YAML entry.
 *   <li>Add a {@code @Bean} method below — 3 lines.
 * </ol>
 *
 * <p>Nothing else changes.
 *
 * <h6>Note on MetricsCache and K8sClientCache</h6>
 *
 * <p>{@link MetricsCache} wraps the package-private {@code SessionMetrics} type, and {@link
 * K8sClientCache} wraps the package-private {@code K8sClientPool.K8sClientEntry} type. Their
 * constructors therefore accept a {@code long maxSize} (the Caffeine cache is constructed inside
 * each class where the wrapped type is in scope). When Redis support for metrics is added, {@code
 * SessionMetrics} must be made {@code public} and the constructor updated to accept a {@code
 * RegistryCache<String, SessionMetrics>} delegate — at which point the {@code metricsCache()} bean
 * below can pass a {@code RedisRegistryCache} directly. {@code K8sClientEntry} holds live socket
 * resources and must remain Caffeine-only regardless (see Redis feasibility table below).
 *
 * <h6>Redis feasibility per cache</h6>
 *
 * <table>
 * <tr>
 * <th>Cache</th>
 * <th>Redis?</th>
 * <th>Reason</th>
 * </tr>
 * <tr>
 * <td>{@link SshConnectionCache}</td>
 * <td>No</td>
 * <td>Holds live SSH/SFTP sockets — not serializable.</td>
 * </tr>
 * <tr>
 * <td>{@link TerminalSessionCache}</td>
 * <td>No</td>
 * <td>Holds live WebSocket + SSH channel — not serializable.</td>
 * </tr>
 * <tr>
 * <td>{@link TransferCache}</td>
 * <td>Yes</td>
 * <td>Plain data object; per-entry TTL maps to Redis {@code EX}. Best Redis
 * candidate.</td>
 * </tr>
 * <tr>
 * <td>{@link MetricsCache}</td>
 * <td>Possible</td>
 * <td>{@code SessionMetrics} must be made public + serializable first.</td>
 * </tr>
 * <tr>
 * <td>{@link K8sClientCache}</td>
 * <td>No</td>
 * <td>Holds live KubernetesClient + SSH tunnel — not serializable.</td>
 * </tr>
 * <tr>
 * <td>{@link DockerClientCache}</td>
 * <td>No</td>
 * <td>Holds live DockerClient + SSH tunnel — not serializable.</td>
 * </tr>
 * </table>
 */
@Configuration
@RequiredArgsConstructor
public class RegistryCacheConfig {

    private static final Logger log = LoggerFactory.getLogger(RegistryCacheConfig.class);

    private final CacheProperties props;
    private final ObjectMapper objectMapper;
    private final ObjectProvider<StringRedisTemplate> redisTemplateProvider;

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

    /**
     * TransferCache uses Redis when available (best Redis candidate: plain data object with
     * per-entry TTL mapping to Redis EX). Falls back to Caffeine if Redis is not configured or
     * unreachable at startup.
     */
    @Bean
    public TransferCache transferCache() {
        StringRedisTemplate redisTemplate = redisTemplateProvider.getIfAvailable();
        if (redisTemplate != null && isRedisReachable(redisTemplate)) {
            log.info("TransferCache backed by Redis");
            return new TransferCache(new RedisCache<>(redisTemplate, objectMapper, "transfer", RemoteTransfer.class));
        }
        log.info(
                "TransferCache backed by Caffeine (max-size={})",
                props.getTransfer().getMaxSize());
        return new TransferCache(
                CaffeineRegistryCache.bounded(props.getTransfer().getMaxSize()));
    }

    /**
     * MetricsCache is constructed with only {@code maxSize} because the value type ({@code
     * SessionMetrics}) is package-private in the {@code analytics} package. The Caffeine backend is
     * created inside {@link MetricsCache} where the type is accessible.
     */
    @Bean
    public MetricsCache metricsCache() {
        return new MetricsCache(props.getMetrics().getMaxSize());
    }

    @Bean
    public K8sClientCache k8sClientCache() {
        return new K8sClientCache(props.getK8sClient().getMaxSize());
    }

    @Bean
    public DockerClientCache dockerClientCache() {
        return new DockerClientCache(props.getDockerClient().getMaxSize());
    }

    // Attempts a ping to verify the Redis server is actually reachable
    private boolean isRedisReachable(StringRedisTemplate redisTemplate) {
        try {
            var factory = redisTemplate.getConnectionFactory();
            if (factory == null) {
                return false;
            }
            try (var connection = factory.getConnection()) {
                connection.commands().ping();
            }
            return true;
        } catch (Exception ex) {
            log.warn("Redis not reachable, caches will fall back to Caffeine: {}", ex.getMessage());
            return false;
        }
    }
}
