package com.weekend.architect.unift.common.cache;

import com.weekend.architect.unift.common.cache.type.CaffeineRegistryCache;
import java.time.Duration;
import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;

/**
 * Abstract base class that implements {@link RegistryCache} entirely by delegating
 * every operation to an inner {@link RegistryCache} instance.
 *
 * <h6>Purpose</h6>
 * <p>Concrete named-cache classes (e.g. {@code SshConnectionCache},
 * {@code TerminalSessionCache}) extend this class with a fixed generic signature and
 * a specific backend (currently {@link CaffeineRegistryCache}).  Because each named
 * cache is a distinct Java type, Spring can inject them by type — no {@code @Qualifier}
 * or raw generic wiring required.
 *
 * <pre>
 *   DelegatingRegistryCache&lt;K, V&gt;        (abstract, all delegation here)
 *        ↑
 *   SshConnectionCache                   (@Component — injected into SessionRegistry)
 *   TerminalSessionCache                 (@Component — injected into TerminalSessionRegistry)
 *   TransferCache                        (@Component — injected into TransferRegistry)
 *   MetricsCache                         (@Component — injected into SessionMetricsStore)
 * </pre>
 *
 * <h6>Backend migration path</h6>
 * <p>Each subclass passes its backend to {@code super(delegate)}.  To switch the
 * entire application to Redis, update the delegate argument in each subclass
 * (or inject a {@code RedisRegistryCache} Spring {@code @Bean}).  The registry
 * layer — {@code SessionRegistry}, {@code TerminalSessionRegistry}, etc. — requires
 * <em>no changes</em>.
 *
 * @param <K> key type
 * @param <V> value type
 */
public abstract class DelegatingRegistryCache<K, V> implements RegistryCache<K, V> {

    private final RegistryCache<K, V> delegate;

    /**
     * @param delegate the backing {@link RegistryCache} implementation;
     *                 typically a {@link CaffeineRegistryCache} instance
     */
    protected DelegatingRegistryCache(RegistryCache<K, V> delegate) {
        this.delegate = delegate;
    }

    @Override
    public void put(K key, V value) {
        delegate.put(key, value);
    }

    @Override
    public void put(K key, V value, Duration ttl) {
        delegate.put(key, value, ttl);
    }

    @Override
    public V getIfPresent(K key) {
        return delegate.getIfPresent(key);
    }

    @Override
    public V computeIfAbsent(K key, Function<K, V> loader) {
        return delegate.computeIfAbsent(key, loader);
    }

    @Override
    public V remove(K key) {
        return delegate.remove(key);
    }

    @Override
    public int removeIf(Predicate<V> predicate) {
        return delegate.removeIf(predicate);
    }

    @Override
    public Collection<V> values() {
        return delegate.values();
    }

    @Override
    public Set<Map.Entry<K, V>> entries() {
        return delegate.entries();
    }

    @Override
    public Set<K> keys() {
        return delegate.keys();
    }

    @Override
    public long estimatedSize() {
        return delegate.estimatedSize();
    }
}
