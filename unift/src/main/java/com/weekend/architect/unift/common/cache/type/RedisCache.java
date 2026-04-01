package com.weekend.architect.unift.common.cache.type;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weekend.architect.unift.common.cache.RegistryCache;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * {@link RegistryCache} implementation backed by Redis via Spring {@link StringRedisTemplate}.
 *
 * <p>Values are serialized to JSON using Jackson {@link ObjectMapper}. All keys are prefixed with
 * {@code unift:cache:{prefix}:} to isolate different named caches within the same Redis database.
 *
 * <p>This implementation is resilient to Redis failures: operations log warnings and return
 * null/empty rather than propagating exceptions, so the application continues to function (in
 * degraded mode) if Redis becomes unavailable.
 *
 * <p>Uses SCAN (never KEYS) for iteration to avoid blocking Redis in production.
 *
 * @param <K> key type (converted to String via {@code toString()})
 * @param <V> value type (must be Jackson-serializable)
 */
public class RedisCache<K, V> implements RegistryCache<K, V> {

    private static final Logger log = LoggerFactory.getLogger(RedisCache.class);
    private static final int SCAN_BATCH_SIZE = 100;

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final String keyPrefix;
    private final Class<V> valueType;

    /**
     * @param redisTemplate Spring-managed template with String serializers for keys and values
     * @param objectMapper Jackson mapper used to serialize/deserialize cache values as JSON
     * @param prefix cache name used in the key namespace (e.g. "transfer")
     * @param valueType runtime class of V, needed for Jackson deserialization
     */
    public RedisCache(StringRedisTemplate redisTemplate, ObjectMapper objectMapper, String prefix, Class<V> valueType) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.keyPrefix = "unift:cache:" + prefix + ":";
        this.valueType = valueType;
    }

    @Override
    public void put(K key, V value) {
        try {
            String json = objectMapper.writeValueAsString(value);
            redisTemplate.opsForValue().set(toRedisKey(key), json);
        } catch (Exception ex) {
            log.warn("Redis PUT failed for key [{}]: {}", key, ex.getMessage());
        }
    }

    @Override
    public void put(K key, V value, Duration ttl) {
        try {
            String json = objectMapper.writeValueAsString(value);
            redisTemplate.opsForValue().set(toRedisKey(key), json, ttl.toMillis(), TimeUnit.MILLISECONDS);
        } catch (Exception ex) {
            log.warn("Redis PUT with TTL failed for key [{}]: {}", key, ex.getMessage());
        }
    }

    @Override
    public V getIfPresent(K key) {
        try {
            String json = redisTemplate.opsForValue().get(toRedisKey(key));
            return deserialize(json);
        } catch (Exception ex) {
            log.warn("Redis GET failed for key [{}]: {}", key, ex.getMessage());
            return null;
        }
    }

    /**
     * Returns the value for {@code key} if present; otherwise computes it with {@code loader},
     * stores the result (no TTL), and returns it.
     *
     * <p>Not atomic across distributed nodes — acceptable for cache warm-up use cases.
     */
    @Override
    public V computeIfAbsent(K key, Function<K, V> loader) {
        V existing = getIfPresent(key);
        if (existing != null) {
            return existing;
        }
        V computed = loader.apply(key);
        if (computed != null) {
            put(key, computed);
        }
        return computed;
    }

    @Override
    public V remove(K key) {
        try {
            String redisKey = toRedisKey(key);
            String json = redisTemplate.opsForValue().getAndDelete(redisKey);
            return deserialize(json);
        } catch (Exception ex) {
            log.warn("Redis REMOVE failed for key [{}]: {}", key, ex.getMessage());
            return null;
        }
    }

    @Override
    public void invalidate(K key) {
        try {
            redisTemplate.delete(toRedisKey(key));
        } catch (Exception ex) {
            log.warn("Redis INVALIDATE failed for key [{}]: {}", key, ex.getMessage());
        }
    }

    @Override
    public int removeIf(Predicate<V> predicate) {
        int removed = 0;
        try {
            List<String> keysToDelete = new ArrayList<>();
            try (Cursor<String> cursor = openScan()) {
                while (cursor.hasNext()) {
                    String redisKey = cursor.next();
                    V value = fetchAndDeserialize(redisKey);
                    if (value != null && predicate.test(value)) {
                        keysToDelete.add(redisKey);
                    }
                }
            }
            if (!keysToDelete.isEmpty()) {
                Long count = redisTemplate.delete(keysToDelete);
                removed = count != null ? count.intValue() : 0;
            }
        } catch (Exception ex) {
            log.warn("Redis REMOVE_IF failed: {}", ex.getMessage());
        }
        return removed;
    }

    // Returns a point-in-time snapshot of all values in this cache namespace
    @Override
    public Collection<V> values() {
        List<V> result = new ArrayList<>();
        try {
            try (Cursor<String> cursor = openScan()) {
                while (cursor.hasNext()) {
                    V value = fetchAndDeserialize(cursor.next());
                    if (value != null) {
                        result.add(value);
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Redis VALUES scan failed: {}", ex.getMessage());
        }
        return Collections.unmodifiableList(result);
    }

    // Returns a point-in-time snapshot of all entries in this cache namespace
    @Override
    public Set<Map.Entry<K, V>> entries() {
        Set<Map.Entry<K, V>> result = new LinkedHashSet<>();
        try {
            try (Cursor<String> cursor = openScan()) {
                while (cursor.hasNext()) {
                    String redisKey = cursor.next();
                    V value = fetchAndDeserialize(redisKey);
                    if (value != null) {
                        @SuppressWarnings("unchecked")
                        K rawKey = (K) stripPrefix(redisKey);
                        result.add(Map.entry(rawKey, value));
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Redis ENTRIES scan failed: {}", ex.getMessage());
        }
        return Collections.unmodifiableSet(result);
    }

    @Override
    public Set<K> keys() {
        Set<K> result = new LinkedHashSet<>();
        try {
            try (Cursor<String> cursor = openScan()) {
                while (cursor.hasNext()) {
                    @SuppressWarnings("unchecked")
                    K rawKey = (K) stripPrefix(cursor.next());
                    result.add(rawKey);
                }
            }
        } catch (Exception ex) {
            log.warn("Redis KEYS scan failed: {}", ex.getMessage());
        }
        return Collections.unmodifiableSet(result);
    }

    // Counts entries via SCAN (no DBSIZE — that counts all keys, not just this
    // namespace)
    @Override
    public long estimatedSize() {
        long count = 0;
        try {
            try (Cursor<String> cursor = openScan()) {
                while (cursor.hasNext()) {
                    cursor.next();
                    count++;
                }
            }
        } catch (Exception ex) {
            log.warn("Redis ESTIMATED_SIZE scan failed: {}", ex.getMessage());
        }
        return count;
    }

    // Builds the full Redis key by prepending the cache namespace prefix
    private String toRedisKey(K key) {
        return keyPrefix + key.toString();
    }

    // Strips the namespace prefix from a full Redis key to recover the original key
    private String stripPrefix(String redisKey) {
        return redisKey.substring(keyPrefix.length());
    }

    // Opens a SCAN cursor matching all keys in this cache namespace
    private Cursor<String> openScan() {
        ScanOptions options = ScanOptions.scanOptions()
                .match(keyPrefix + "*")
                .count(SCAN_BATCH_SIZE)
                .build();
        return redisTemplate.scan(options);
    }

    // Fetches the raw JSON at the given full Redis key and deserializes it
    private V fetchAndDeserialize(String redisKey) {
        try {
            String json = redisTemplate.opsForValue().get(redisKey);
            return deserialize(json);
        } catch (Exception ex) {
            log.warn("Redis deserialization failed for key [{}]: {}", redisKey, ex.getMessage());
            return null;
        }
    }

    // Deserializes a JSON string to the value type; returns null on failure
    private V deserialize(String json) {
        if (json == null) {
            return null;
        }
        try {
            return objectMapper.readValue(json, valueType);
        } catch (JsonProcessingException ex) {
            log.warn("Failed to deserialize value of type [{}]: {}", valueType.getSimpleName(), ex.getMessage());
            return null;
        }
    }
}
