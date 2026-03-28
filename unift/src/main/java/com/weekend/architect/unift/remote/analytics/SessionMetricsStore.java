package com.weekend.architect.unift.remote.analytics;

import com.weekend.architect.unift.common.cache.namedcache.MetricsCache;
import com.weekend.architect.unift.remote.analytics.dto.TrafficDataPoint;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * In-memory per-session bandwidth and activity store.
 *
 * <h6>Responsibilities</h6>
 * <ul>
 *   <li>Accumulate upload/download byte counters as transfers progress.</li>
 *   <li>Record the last API activity timestamp (used as a heartbeat proxy).</li>
 *   <li>Take a bandwidth sample every minute and maintain a rolling 60-entry
 *       history per session (last 60 minutes of Mbps data for traffic charts).</li>
 * </ul>
 *
 * <h6>Backing store</h6>
 * <p>Uses an injected {@link MetricsCache} (Caffeine-backed by default, bounded to
 * 10,000 entries).  Entries are removed explicitly via {@link #removeSession} when a
 * session closes.  Swapping to Redis requires only changing {@link MetricsCache}'s
 * constructor — no code changes here.
 *
 * <p>{@code sampleWindowSecs} is derived from the injected
 * {@code unift.analytics.sample-interval-ms} value so the bps divisor always
 * matches the actual scheduler cadence.
 */
@Slf4j
@Component
public class SessionMetricsStore {

    /**
     * Seconds per sample window — derived from the configured scheduler interval.
     */
    private final long sampleWindowSecs;

    private final MetricsCache store;

    public SessionMetricsStore(
            MetricsCache store, @Value("${unift.analytics.sample-interval-ms:60000}") long sampleIntervalMs) {
        this.store = store;
        this.sampleWindowSecs = Math.max(1L, sampleIntervalMs / 1_000L);
    }

    /** Called when a session is first opened. */
    public void initSession(String sessionId) {
        store.computeIfAbsent(sessionId, ignore -> new SessionMetrics());
        log.debug("[metrics-store] Initialised metrics for session {}", sessionId);
    }

    /** Called when a session is closed/reaped. Frees accumulated state. */
    public void removeSession(String sessionId) {
        store.invalidate(sessionId);
        log.debug("[metrics-store] Removed metrics for session {}", sessionId);
    }

    /** Adds {@code delta} bytes to the cumulative upload counter for this session. */
    public void addUploadBytes(String sessionId, long delta) {
        SessionMetrics m = store.getIfPresent(sessionId);
        if (m != null && delta > 0) {
            m.totalUpload.addAndGet(delta);
            m.lastActivityMs.set(System.currentTimeMillis());
        }
    }

    /** Adds {@code delta} bytes to the cumulative download counter for this session. */
    public void addDownloadBytes(String sessionId, long delta) {
        SessionMetrics m = store.getIfPresent(sessionId);
        if (m != null && delta > 0) {
            m.totalDownload.addAndGet(delta);
            m.lastActivityMs.set(System.currentTimeMillis());
        }
    }

    /** Updates the last-activity timestamp without modifying byte counters. */
    public void touchActivity(String sessionId) {
        SessionMetrics m = store.getIfPresent(sessionId);
        if (m != null) {
            m.lastActivityMs.set(System.currentTimeMillis());
        }
    }

    public long getTotalUploadedBytes(String sessionId) {
        SessionMetrics m = store.getIfPresent(sessionId);
        return m == null ? 0L : m.totalUpload.get();
    }

    public long getTotalDownloadedBytes(String sessionId) {
        SessionMetrics m = store.getIfPresent(sessionId);
        return m == null ? 0L : m.totalDownload.get();
    }

    /** Returns the last-activity instant, or {@code Instant.now()} as a safe default. */
    public Instant getLastActivity(String sessionId) {
        SessionMetrics m = store.getIfPresent(sessionId);
        if (m == null) return Instant.now();
        long ms = m.lastActivityMs.get();
        return ms == 0L ? Instant.now() : Instant.ofEpochMilli(ms);
    }

    /**
     * Returns a snapshot of the rolling traffic history (newest last).
     * Returns an empty list if no samples have been taken yet.
     */
    public List<TrafficDataPoint> getTrafficHistory(String sessionId) {
        SessionMetrics m = store.getIfPresent(sessionId);
        if (m == null) return List.of();
        return m.snapshotHistory();
    }

    /**
     * Runs every {@code unift.analytics.sample-interval-ms} (default: 60 s).
     * For each tracked session, computes the byte delta since the last snapshot
     * and appends a {@link TrafficDataPoint} to the rolling deque.
     *
     * <p>The bps divisor uses {@link #sampleWindowSecs} (C1 fix — was hardcoded to 60).
     */
    @Scheduled(fixedRateString = "${unift.analytics.sample-interval-ms:60000}")
    public void sampleBandwidth() {
        if (store.estimatedSize() == 0) return;

        Instant now = Instant.now();
        int sampled = 0;

        for (Map.Entry<String, SessionMetrics> entry : store.entries()) {
            SessionMetrics m = entry.getValue();

            long currentUpload = m.totalUpload.get();
            long currentDownload = m.totalDownload.get();

            long deltaUpload = Math.max(0, currentUpload - m.lastSampledUpload.get());
            long deltaDownload = Math.max(0, currentDownload - m.lastSampledDownload.get());

            long uploadBps = deltaUpload / sampleWindowSecs;
            long downloadBps = deltaDownload / sampleWindowSecs;

            m.appendHistory(TrafficDataPoint.builder()
                    .timestamp(now)
                    .uploadBytesPerSec(uploadBps)
                    .downloadBytesPerSec(downloadBps)
                    .build());

            m.lastSampledUpload.set(currentUpload);
            m.lastSampledDownload.set(currentDownload);

            sampled++;
        }

        if (sampled > 0) {
            log.debug("[metrics-store] Took bandwidth sample for {} session(s)", sampled);
        }
    }
}
