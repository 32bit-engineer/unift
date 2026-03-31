package com.weekend.architect.unift.remote.docker;

import com.weekend.architect.unift.common.cache.DelegatingRegistryCache;
import com.weekend.architect.unift.common.cache.config.RegistryCacheConfig;
import com.weekend.architect.unift.common.cache.model.CacheProperties;
import com.weekend.architect.unift.common.cache.type.CaffeineRegistryCache;
import com.weekend.architect.unift.remote.docker.DockerClientPool.DockerClientEntry;

/**
 * Named cache for live {@link DockerClientEntry} instances — one entry per active
 * SSH session that has requested Docker operations.
 *
 * <p>Constructed exclusively by {@link RegistryCacheConfig}, which reads the max-size
 * from {@link CacheProperties} ({@code unift.cache.docker-client.*}).
 * Injected into {@link DockerClientPool} by concrete-class type matching.
 *
 * <p>{@link DockerClientEntry} holds a live {@code DockerClient} (HTTP connection pool)
 * and an SSH port-forward tunnel — both are stateful, non-serializable resources.
 * This cache is therefore <strong>Caffeine-only</strong> and must not be migrated to Redis.
 *
 * @see RegistryCacheConfig#dockerClientCache()
 */
public final class DockerClientCache extends DelegatingRegistryCache<String, DockerClientEntry> {

    /**
     * Constructs a Caffeine-backed cache with the given capacity.
     * Called exclusively by {@link RegistryCacheConfig}.
     *
     * @param maxSize upper bound on the number of entries (W-TinyLFU eviction beyond this)
     */
    public DockerClientCache(long maxSize) {
        super(CaffeineRegistryCache.bounded(maxSize));
    }
}
