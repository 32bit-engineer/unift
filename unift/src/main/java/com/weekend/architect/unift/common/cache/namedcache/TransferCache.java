package com.weekend.architect.unift.common.cache.namedcache;

import com.weekend.architect.unift.common.cache.DelegatingRegistryCache;
import com.weekend.architect.unift.common.cache.RegistryCache;
import com.weekend.architect.unift.common.cache.config.RegistryCacheConfig;
import com.weekend.architect.unift.remote.model.RemoteTransfer;

/**
 * Named cache for {@link RemoteTransfer} records.
 *
 * <p>Constructed and configured by {@link RegistryCacheConfig} via
 * {@code unift.cache.transfer.*}.  Per-entry TTL (applied to terminal-state transfers)
 * is managed by {@code TransferRegistry} using
 * {@link RegistryCache#put(Object, Object, java.time.Duration)}.
 * Injected into {@code TransferRegistry} by concrete-class type matching.
 *
 * <h6>Redis migration</h6>
 * <p>Pass a {@code RedisRegistryCache<String, RemoteTransfer>} as the delegate in
 * {@link RegistryCacheConfig#transferCache()}.  TTL semantics are preserved:
 * {@code put(k, v, duration)} maps to {@code SET k v EX seconds} in Redis.
 */
public final class TransferCache extends DelegatingRegistryCache<String, RemoteTransfer> {

    public TransferCache(RegistryCache<String, RemoteTransfer> delegate) {
        super(delegate);
    }
}
