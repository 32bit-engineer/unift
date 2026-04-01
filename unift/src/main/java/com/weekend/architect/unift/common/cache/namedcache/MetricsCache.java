package com.weekend.architect.unift.common.cache.namedcache;

import com.weekend.architect.unift.common.cache.DelegatingRegistryCache;
import com.weekend.architect.unift.common.cache.config.RegistryCacheConfig;
import com.weekend.architect.unift.common.cache.type.CaffeineRegistryCache;
import com.weekend.architect.unift.remote.analytics.SessionMetrics;
import com.weekend.architect.unift.remote.analytics.SessionMetricsStore;

/**
 * Named cache for {@link SessionMetrics} buckets.
 *
 * <p>Lives in the {@code analytics} package alongside the package-private {@link SessionMetrics},
 * so that the generic type parameter is accessible when constructing the Caffeine backend.
 *
 * <p>Constructed by {@link RegistryCacheConfig} via {@code unift.cache.metrics.max-size} ({@code
 * maxSize} is passed in rather than a fully typed delegate because {@code SessionMetrics} is not
 * visible outside this package). Injected into {@link SessionMetricsStore} by concrete-class type
 * matching.
 *
 * <h6>Redis migration</h6>
 *
 * <p>When Redis support for metrics is added, {@link SessionMetrics} must first be made {@code
 * public} and annotated for serialisation. At that point, add a second constructor {@code
 * MetricsCache(RegistryCache&lt;String, SessionMetrics&gt; delegate)} and pass a {@code
 * RedisRegistryCache} from {@code RegistryCacheConfig}.
 */
public final class MetricsCache extends DelegatingRegistryCache<String, SessionMetrics> {

    /**
     * Constructs a Caffeine-backed cache with the given capacity. Called exclusively by {@link
     * RegistryCacheConfig}.
     *
     * @param maxSize upper bound on the number of entries (W-TinyLFU eviction beyond this)
     */
    public MetricsCache(long maxSize) {
        super(CaffeineRegistryCache.bounded(maxSize));
    }
}
