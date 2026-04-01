package com.weekend.architect.unift.remote.analytics;

import com.weekend.architect.unift.common.cache.RegistryCache;
import com.weekend.architect.unift.remote.analytics.dto.TrafficDataPoint;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Mutable per-session metrics bucket held inside {@link SessionMetricsStore}.
 *
 * <p>Package-private — intentionally not part of the public API. Extracted from a static inner
 * class so that {@code SessionMetricsStore} can declare its {@link RegistryCache} field with a
 * concrete generic type, enabling a future Redis-backed implementation.
 *
 * <h6>Thread-safety</h6>
 *
 * <p>The {@link AtomicLong} counters are individually thread-safe. The {@code history} deque is
 * guarded by a {@code synchronized} block.
 */
public final class SessionMetrics {

    /** Maximum traffic data points kept per session (= 60 minutes at default cadence). */
    static final int MAX_HISTORY_ENTRIES = 60;

    final AtomicLong totalUpload = new AtomicLong(0);
    final AtomicLong totalDownload = new AtomicLong(0);

    /** Reference points for computing per-sample bandwidth deltas. */
    final AtomicLong lastSampledUpload = new AtomicLong(0);

    final AtomicLong lastSampledDownload = new AtomicLong(0);

    /** Epoch millis of last activity; {@code 0} until first activity is recorded. */
    final AtomicLong lastActivityMs = new AtomicLong(0);

    /** Rolling bandwidth history; capacity = {@link #MAX_HISTORY_ENTRIES} + 1 to avoid resize. */
    private final Deque<TrafficDataPoint> history = new ArrayDeque<>(MAX_HISTORY_ENTRIES + 1);

    void appendHistory(TrafficDataPoint point) {
        synchronized (history) {
            history.addLast(point);
            while (history.size() > MAX_HISTORY_ENTRIES) {
                history.pollFirst();
            }
        }
    }

    List<TrafficDataPoint> snapshotHistory() {
        synchronized (history) {
            return new ArrayList<>(history);
        }
    }
}
