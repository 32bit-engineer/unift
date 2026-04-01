package com.weekend.architect.unift.remote.kubernetes;

import com.weekend.architect.unift.common.cache.DelegatingRegistryCache;
import com.weekend.architect.unift.common.cache.config.RegistryCacheConfig;
import com.weekend.architect.unift.common.cache.model.CacheProperties;
import com.weekend.architect.unift.common.cache.type.CaffeineRegistryCache;
import com.weekend.architect.unift.remote.kubernetes.K8sClientPool.K8sClientEntry;

/**
 * Named cache for live Fabric8 {@link K8sClientEntry} instances — one entry per active SSH session
 * (or direct-kubeconfig key).
 *
 * <p>Constructed exclusively by {@link RegistryCacheConfig}, which reads the max-size from {@link
 * CacheProperties} ({@code unift.cache.k8s-client.*}). Injected into {@link K8sClientPool} by
 * concrete-class type matching.
 *
 * <h6>Why the maxSize constructor?</h6>
 *
 * <p>{@link K8sClientEntry} is a package-private nested record of {@link K8sClientPool}, visible
 * only within the {@code kubernetes} package. The Caffeine backend is therefore constructed here
 * (where the type is in scope) rather than in {@link RegistryCacheConfig} — the same pattern used
 * by {@code MetricsCache} for {@code SessionMetrics}.
 *
 * <h6>Redis migration note</h6>
 *
 * <p>{@link K8sClientEntry} holds a live {@code KubernetesClient} (active HTTP connection pool) and
 * an optional SSH tunnel — both are stateful, non-serializable resources. This cache is therefore
 * <strong>Caffeine-only</strong> and must not be migrated to Redis.
 *
 * @see RegistryCacheConfig#k8sClientCache()
 */
public final class K8sClientCache extends DelegatingRegistryCache<String, K8sClientEntry> {

    /**
     * Constructs a Caffeine-backed cache with the given capacity. Called exclusively by {@link
     * RegistryCacheConfig}.
     *
     * @param maxSize upper bound on the number of entries (W-TinyLFU eviction beyond this)
     */
    public K8sClientCache(long maxSize) {
        super(CaffeineRegistryCache.bounded(maxSize));
    }
}
