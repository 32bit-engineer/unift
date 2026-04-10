package com.weekend.architect.unift.common.cache.namedcache;

import com.weekend.architect.unift.common.cache.DelegatingRegistryCache;
import com.weekend.architect.unift.common.cache.RegistryCache;
import com.weekend.architect.unift.common.cache.config.RegistryCacheConfig;
import com.weekend.architect.unift.common.cache.model.CacheProperties;
import com.weekend.architect.unift.remote.core.RemoteConnection;

/**
 * Named cache for live SSH/SFTP {@link RemoteConnection} instances.
 *
 * <p>Constructed and configured exclusively by {@link RegistryCacheConfig}, which reads the
 * max-size from {@link CacheProperties} ({@code unift.cache.ssh-connection.*}). Injected into
 * {@code SessionRegistry} by Spring using the concrete class as the implicit qualifier — no
 * {@code @Qualifier} annotation needed.
 *
 * <h6>Redis migration</h6>
 *
 * <p>Pass a {@code RedisRegistryCache<String, RemoteConnection>} as the {@code delegate} argument
 * in {@link RegistryCacheConfig#sshConnectionCache()}. No other changes needed.
 */
public final class SshConnectionCache extends DelegatingRegistryCache<String, RemoteConnection> {

    /** Called by {@link RegistryCacheConfig}; */
    public SshConnectionCache(RegistryCache<String, RemoteConnection> delegate) {
        super(delegate);
    }
}
