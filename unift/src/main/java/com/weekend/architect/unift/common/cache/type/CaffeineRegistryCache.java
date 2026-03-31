package com.weekend.architect.unift.common.cache.type;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Expiry;
import com.github.benmanes.caffeine.cache.RemovalCause;
import com.weekend.architect.unift.common.cache.RegistryCache;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.function.Predicate;

/**
 * {@link RegistryCache} implementation backed by a
 * <a href="https://github.com/ben-manes/caffeine">Caffeine</a> in-process cache.
 *
 * <h6>Per-entry TTL</h6>
 * <p>Caffeine's {@link Expiry} API controls eviction timing.  Because Caffeine
 * does not expose per-entry TTL through the standard {@code put()} call, this
 * class maintains a lightweight side-map ({@code ttlDeadlines}) of
 * {@code key → System.nanoTime() + ttl}.  The custom {@link Expiry} implementation
 * consults this map in both {@code expireAfterCreate} and {@code expireAfterUpdate},
 * returning {@link Long#MAX_VALUE} (never expire) for entries without a deadline.
 *
 * <p>The side-map is kept in sync with the main cache via a Caffeine removal
 * listener that deletes the deadline when any entry is evicted or explicitly removed.
 *
 * <h6>Eviction contract</h6>
 * <ul>
 *   <li>{@link #put(Object, Object)} — removes any existing deadline; entry lives
 *       until explicitly removed or size-cap eviction.</li>
 *   <li>{@link #put(Object, Object, Duration)} — records a nano-deadline; Caffeine
 *       evicts the entry once that deadline passes.</li>
 * </ul>
 *
 * <h6>Thread-safety</h6>
 * <p>Caffeine is fully thread-safe.  {@code ttlDeadlines} is a
 * {@link ConcurrentHashMap}.  The ordering of {@code ttlDeadlines} writes and
 * {@code inner.put()} calls (deadline written <em>before</em> cache insert) ensures
 * the {@link Expiry} callbacks always see a consistent deadline.
 *
 * <h6>Future migration to Redis</h6>
 * <p>Swap this implementation by registering a {@code RedisRegistryCache} Spring
 * {@code @Bean} of the same generic type.  The registries depend only on
 * {@link RegistryCache} and require no code changes.
 *
 * @param <K> key type
 * @param <V> value type
 */
public final class CaffeineRegistryCache<K, V> implements RegistryCache<K, V> {

    /**
     * Nano-time deadlines for entries that were inserted with an explicit TTL.
     * Entries without a deadline are absent from this map (= never expire).
     * Cleaned up automatically via the Caffeine removal listener.
     */
    private final ConcurrentHashMap<K, Long> ttlDeadlines = new ConcurrentHashMap<>();

    private final Cache<K, V> inner;

    private CaffeineRegistryCache(long maximumSize) {
        this.inner = Caffeine.newBuilder()
                .maximumSize(maximumSize)
                .expireAfter(buildExpiry())
                .removalListener(this::onRemoval)
                .build();
    }

    /**
     * Creates a new {@link CaffeineRegistryCache} bounded to {@code maximumSize} entries.
     *
     * <p>Once the cache reaches capacity, Caffeine evicts the entry estimated to be
     * accessed least recently (approximate W-TinyLFU policy).
     *
     * @param maximumSize upper bound on the number of entries; use a generous value
     *                    (e.g. {@code 10_000}) for safety capping rather than strict limiting
     * @return a new {@code CaffeineRegistryCache} instance
     */
    public static <K, V> CaffeineRegistryCache<K, V> bounded(long maximumSize) {
        return new CaffeineRegistryCache<>(maximumSize);
    }

    /**
     * Stores the entry with no expiry.  Any prior TTL on this key is cancelled:
     * {@code ttlDeadlines} is cleaned <em>before</em> the Caffeine insert so the
     * {@link Expiry#expireAfterUpdate} callback sees no deadline and returns
     * {@link Long#MAX_VALUE}.
     */
    @Override
    public void put(K key, V value) {
        ttlDeadlines.remove(key); // cancel existing TTL before cache write
        inner.put(key, value);
    }

    /**
     * Stores the entry with the given TTL.  The nano-deadline is written to
     * {@code ttlDeadlines} <em>before</em> the Caffeine insert so the
     * {@link Expiry} callback sees it immediately.
     */
    @Override
    public void put(K key, V value, Duration ttl) {
        ttlDeadlines.put(key, System.nanoTime() + ttl.toNanos());
        inner.put(key, value);
    }

    @Override
    public V getIfPresent(K key) {
        return inner.getIfPresent(key);
    }

    @Override
    public V computeIfAbsent(K key, Function<K, V> loader) {
        return inner.get(key, loader);
    }

    /**
     * Removes the entry and returns its previous value.
     *
     * <p>Uses {@code asMap().remove()} which is ConcurrentHashMap-compatible:
     * the Caffeine removal listener fires (cleaning up {@code ttlDeadlines})
     * and the previous value is returned in one step.
     */
    @Override
    public V remove(K key) {
        return inner.asMap().remove(key);
    }

    @Override
    public int removeIf(Predicate<V> predicate) {
        List<K> toRemove = inner.asMap().entrySet().stream()
                .filter(e -> predicate.test(e.getValue()))
                .map(Map.Entry::getKey)
                .toList();
        inner.invalidateAll(toRemove); // triggers removal listener for each key
        return toRemove.size();
    }

    /** Returns a live {@link ConcurrentHashMap}-backed view of cached values. */
    @Override
    public Collection<V> values() {
        return inner.asMap().values();
    }

    /** Returns a live view of cached entries. */
    @Override
    public Set<Map.Entry<K, V>> entries() {
        return inner.asMap().entrySet();
    }

    /** Returns the live key set. */
    @Override
    public Set<K> keys() {
        return inner.asMap().keySet();
    }

    @Override
    public long estimatedSize() {
        return inner.estimatedSize();
    }

    /**
     * Builds a {@link Expiry} that returns the remaining nanos until the recorded
     * deadline (for TTL entries) or {@link Long#MAX_VALUE} (for no-TTL entries).
     *
     * <p>{@code expireAfterRead} returns {@code currentDuration} unchanged — read
     * access does not reset the TTL clock.
     */
    private Expiry<K, V> buildExpiry() {
        return new Expiry<>() {

            @Override
            public long expireAfterCreate(K key, V value, long currentTime) {
                return remainingNanos(key, currentTime);
            }

            @Override
            public long expireAfterUpdate(K key, V value, long currentTime, long currentDuration) {
                return remainingNanos(key, currentTime);
            }

            @Override
            public long expireAfterRead(K key, V value, long currentTime, long currentDuration) {
                return currentDuration; // reads do not refresh TTL
            }

            private long remainingNanos(K key, long currentTime) {
                Long deadline = ttlDeadlines.get(key);
                return deadline == null ? Long.MAX_VALUE : Math.max(0L, deadline - currentTime);
            }
        };
    }

    /**
     * Removal listener: keeps {@code ttlDeadlines} in sync with the main cache.
     * Called for all removal causes: EXPLICIT, REPLACED, EXPIRED, SIZE, COLLECTED.
     */
    private void onRemoval(K key, V value, RemovalCause cause) {
        if (key != null) {
            ttlDeadlines.remove(key);
        }
    }
}
