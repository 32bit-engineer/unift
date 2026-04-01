package com.weekend.architect.unift.common.cache.namedcache;

import com.weekend.architect.unift.common.cache.DelegatingRegistryCache;
import com.weekend.architect.unift.common.cache.RegistryCache;
import com.weekend.architect.unift.common.cache.config.RegistryCacheConfig;
import com.weekend.architect.unift.remote.model.TerminalSession;

/**
 * Named cache for live WebSocket {@link TerminalSession} instances.
 *
 * <p>Constructed and configured by {@link RegistryCacheConfig} via {@code
 * unift.cache.terminal-session.*}. Injected into {@code TerminalSessionRegistry} by concrete-class
 * type matching.
 *
 * <h6>Redis migration</h6>
 *
 * <p>Pass a {@code RedisRegistryCache<String, TerminalSession>} as the delegate in {@link
 * RegistryCacheConfig#terminalSessionCache()}.
 */
public final class TerminalSessionCache extends DelegatingRegistryCache<String, TerminalSession> {

    public TerminalSessionCache(RegistryCache<String, TerminalSession> delegate) {
        super(delegate);
    }
}
