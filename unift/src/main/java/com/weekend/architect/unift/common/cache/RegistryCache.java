package com.weekend.architect.unift.common.cache;

import com.weekend.architect.unift.common.cache.type.CaffeineRegistryCache;
import java.time.Duration;
import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;

/**
 * <h5>key-value store contract used by all in-memory registries.</h5>
 *
 * <h6>Two-tier eviction model</h6>
 * <ul>
 *   <li>{@link #put(Object, Object)} — entry has no TTL; it lives until removed
 *       explicitly or the implementation's size-cap evicts it.</li>
 *   <li>{@link #put(Object, Object, Duration)} — entry expires automatically after
 *       {@code ttl}.  Used by {@code TransferRegistry} to evict terminal-state
 *       transfers without manual cleanup.</li>
 * </ul>
 *
 * <h6>Known implementations</h6>
 * <ul>
 *   <li>{@link CaffeineRegistryCache} — single-node, in-process (default)</li>
 *   <li>{@code RedisRegistryCache} — distributed, multi-node (future).
 *       Swap in by providing an alternative Spring {@code @Bean}; no registry
 *       code changes required.</li>
 * </ul>
 *
 * <h6>Thread-safety</h6>
 * <p>All implementations must be fully thread-safe.
 *
 * @param <K> key type
 * @param <V> value type
 */
public interface RegistryCache<K, V> {

    /**
     * Stores {@code value} under {@code key} with no expiry.
     * Any existing TTL on the key is cancelled.
     */
    void put(K key, V value);

    /**
     * Stores {@code value} under {@code key} and schedules automatic eviction
     * after {@code ttl} elapses.
     *
     * <p>If an entry for {@code key} already exists (with or without a TTL),
     * it is replaced and the TTL clock is reset from now.
     *
     * @param ttl positive duration after which the entry is evicted
     */
    void put(K key, V value, Duration ttl);

    /**
     * Returns the value associated with {@code key}, or {@code null} if the
     * entry is absent or has already expired.
     */
    V getIfPresent(K key);

    /**
     * Returns the value for {@code key} if present; otherwise atomically
     * computes it with {@code loader}, stores it (no TTL), and returns it.
     */
    V computeIfAbsent(K key, Function<K, V> loader);

    /**
     * Removes the entry for {@code key} and returns its previous value,
     * or {@code null} if it was absent.  Idempotent.
     */
    V remove(K key);

    /**
     * Removes the entry for {@code key} without returning the previous value.
     * Slightly cheaper than {@link #remove} when the old value is not needed.
     * Idempotent.
     */
    default void invalidate(K key) {
        remove(key);
    }

    /**
     * Removes all entries whose value satisfies {@code predicate}.
     *
     * @return the number of entries removed
     */
    int removeIf(Predicate<V> predicate);

    /**
     * Returns a view of the values currently in the cache.
     *
     * <p>The returned collection may be a live view (Caffeine) or a point-in-time
     * snapshot (Redis).  Callers must not call {@link Collection#removeIf} on it;
     * use {@link #removeIf(Predicate)} instead.
     */
    Collection<V> values();

    /**
     * Returns a view of the entries currently in the cache.
     *
     * @see #values()
     */
    Set<Map.Entry<K, V>> entries();

    /**
     * Returns the set of keys currently in the cache.
     *
     * @see #values()
     */
    Set<K> keys();

    /**
     * Returns an approximate count of entries in the cache.
     * For size-bounded caches this may differ slightly from the exact count
     * due to pending eviction bookkeeping.
     */
    long estimatedSize();
}
