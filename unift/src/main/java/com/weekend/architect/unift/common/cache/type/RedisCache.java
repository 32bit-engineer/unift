package com.weekend.architect.unift.common.cache.type;

import com.weekend.architect.unift.common.cache.RegistryCache;
import java.time.Duration;
import java.util.Collection;
import java.util.Map.Entry;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;

public class RedisCache<K, V> implements RegistryCache<K, V> {

    @Override
    public void put(K key, V value) {
        throw new UnsupportedOperationException("redis cache is a stub, and isn't implemented yet");
    }

    @Override
    public void put(K key, V value, Duration ttl) {
        throw new UnsupportedOperationException("redis cache is a stub, and isn't implemented yet");
    }

    @Override
    public V getIfPresent(K key) {
        throw new UnsupportedOperationException("redis cache is a stub, and isn't implemented yet");
    }

    @Override
    public V computeIfAbsent(K key, Function<K, V> loader) {
        throw new UnsupportedOperationException("redis cache is a stub, and isn't implemented yet");
    }

    @Override
    public V remove(K key) {
        throw new UnsupportedOperationException("redis cache is a stub, and isn't implemented yet");
    }

    @Override
    public void invalidate(K key) {
        throw new UnsupportedOperationException("redis cache is a stub, and isn't implemented yet");
    }

    @Override
    public int removeIf(Predicate<V> predicate) {
        throw new UnsupportedOperationException("redis cache is a stub, and isn't implemented yet");
    }

    @Override
    public Collection<V> values() {
        throw new UnsupportedOperationException("redis cache is a stub, and isn't implemented yet");
    }

    @Override
    public Set<Entry<K, V>> entries() {
        throw new UnsupportedOperationException("redis cache is a stub, and isn't implemented yet");
    }

    @Override
    public Set<K> keys() {
        throw new UnsupportedOperationException("redis cache is a stub, and isn't implemented yet");
    }

    @Override
    public long estimatedSize() {
        throw new UnsupportedOperationException("redis cache is a stub, and isn't implemented yet");
    }
}
