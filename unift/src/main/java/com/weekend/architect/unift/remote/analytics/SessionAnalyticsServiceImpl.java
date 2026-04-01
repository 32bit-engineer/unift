package com.weekend.architect.unift.remote.analytics;

import com.weekend.architect.unift.remote.analytics.dto.AnalyticsHistoryResponse;
import com.weekend.architect.unift.remote.analytics.dto.ConnectedNodeInfo;
import com.weekend.architect.unift.remote.analytics.dto.LatencyInfo;
import com.weekend.architect.unift.remote.analytics.dto.PacketLossInfo;
import com.weekend.architect.unift.remote.analytics.dto.SessionAnalyticsResponse;
import com.weekend.architect.unift.remote.analytics.dto.SessionMetadataInfo;
import com.weekend.architect.unift.remote.analytics.dto.SystemMetricsInfo;
import com.weekend.architect.unift.remote.analytics.dto.ThroughputInfo;
import com.weekend.architect.unift.remote.analytics.dto.TrafficDataPoint;
import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.enums.TransferState;
import com.weekend.architect.unift.remote.exception.RemoteConnectionException;
import com.weekend.architect.unift.remote.exception.SessionAccessDeniedException;
import com.weekend.architect.unift.remote.model.RemoteSession;
import com.weekend.architect.unift.remote.model.RemoteTransfer;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import com.weekend.architect.unift.remote.registry.TransferRegistry;
import com.weekend.architect.unift.remote.ssh.SshRemoteConnection;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

/**
 * Default implementation of {@link SessionAnalyticsService}.
 *
 * <p>The three expensive sub-probes (SSH latency, local ping, remote system metrics) are executed
 * in parallel on virtual threads and merged with a time-bounded {@code CompletableFuture.allOf()},
 * so the overall call completes within a few seconds even when individual probes fail.
 *
 * <h6>Fallbacks</h6>
 *
 * <p>Every probe catches its own exceptions and returns a sentinel value (e.g. {@link
 * LatencyInfo#unavailable()}) — the analytics endpoint never returns a 5xx because a remote host is
 * slow.
 */
@Slf4j
@Service
public class SessionAnalyticsServiceImpl implements SessionAnalyticsService {

    private static final int PROBE_TIMEOUT_SECS = 12;
    private static final int LATENCY_PROBES = 3;
    private static final int PING_PACKETS = 5;

    private final SessionRegistry sessionRegistry;
    private final TransferRegistry transferRegistry;
    private final SessionMetricsStore metricsStore;
    private final SessionAnalyticsSnapshotRepository snapshotRepository;
    private final ExecutorService executorService;

    public SessionAnalyticsServiceImpl(
            SessionRegistry sessionRegistry,
            TransferRegistry transferRegistry,
            SessionMetricsStore metricsStore,
            SessionAnalyticsSnapshotRepository snapshotRepository,
            @Qualifier("virtualThreadExecutor") ExecutorService executorService) {
        this.sessionRegistry = sessionRegistry;
        this.transferRegistry = transferRegistry;
        this.metricsStore = metricsStore;
        this.snapshotRepository = snapshotRepository;
        this.executorService = executorService;
    }

    @Override
    public SessionAnalyticsResponse getAnalytics(String sessionId, UUID requestingUserId) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        assertOwnership(conn, requestingUserId);
        metricsStore.touchActivity(sessionId);

        RemoteSession session = conn.getSession();
        long durationSec = Duration.between(session.getCreatedAt().toInstant(), Instant.now())
                .getSeconds();

        // Run expensive probes in parallel on virtual threads
        try {
            CompletableFuture<LatencyInfo> latencyFuture =
                    CompletableFuture.supplyAsync(() -> measureLatency(conn), executorService);

            CompletableFuture<PacketLossInfo> packetLossFuture =
                    CompletableFuture.supplyAsync(() -> measurePacketLoss(session.getHost()), executorService);

            CompletableFuture<SystemMetricsInfo> systemMetricsFuture =
                    CompletableFuture.supplyAsync(() -> collectSystemMetrics(conn), executorService);

            CompletableFuture<List<ConnectedNodeInfo>> nodesFuture =
                    CompletableFuture.supplyAsync(() -> buildConnectedNodes(requestingUserId), executorService);

            // Wait for all with a ceiling
            CompletableFuture.allOf(latencyFuture, packetLossFuture, systemMetricsFuture, nodesFuture)
                    .orTimeout(PROBE_TIMEOUT_SECS, TimeUnit.SECONDS)
                    .exceptionally(ex -> {
                        log.warn(
                                "[analytics] One or more probes timed out for session {}:" + " {}",
                                sessionId,
                                ex.getMessage());
                        return null;
                    })
                    .join();

            SessionAnalyticsResponse response = SessionAnalyticsResponse.builder()
                    .sessionId(sessionId)
                    .host(session.getHost())
                    .username(session.getUsername())
                    .state(session.getState().name())
                    .sessionDurationSeconds(durationSec)
                    .sessionDurationFormatted(formatDuration(durationSec))
                    .throughput(buildThroughput(sessionId))
                    .latency(latencyFuture.getNow(LatencyInfo.unavailable()))
                    .packetLoss(packetLossFuture.getNow(PacketLossInfo.unavailable()))
                    .trafficAnalysis(metricsStore.getTrafficHistory(sessionId))
                    .connectedNodes(nodesFuture.getNow(List.of()))
                    .metadata(buildSessionMetadata(conn, session))
                    .systemMetrics(systemMetricsFuture.getNow(SystemMetricsInfo.unavailable()))
                    .generatedAt(OffsetDateTime.now())
                    .build();

            // Persist snapshot to DB for historical queries (best-effort)
            snapshotRepository.save(response, requestingUserId);

            return response;
        } catch (Exception exp) {
            log.error("Building Session Analytics for session: {} failed with error: {}", sessionId, exp.getMessage());
            throw new RemoteConnectionException("Unable to get Analytics for current session");
        }
    }

    private ThroughputInfo buildThroughput(String sessionId) {
        long totalUpload = metricsStore.getTotalUploadedBytes(sessionId);
        long totalDownload = metricsStore.getTotalDownloadedBytes(sessionId);
        List<TrafficDataPoint> history = metricsStore.getTrafficHistory(sessionId);

        // Instantaneous speed from active in-flight transfers
        List<RemoteTransfer> active = transferRegistry.getBySession(sessionId).stream()
                .filter(t -> t.getState() == TransferState.IN_PROGRESS)
                .toList();

        long currentUploadBps = 0L;
        long currentDownloadBps = 0L;

        for (RemoteTransfer t : active) {
            long elapsedSec = Duration.between(t.getStartedAt().toInstant(), Instant.now())
                    .getSeconds();
            long transferred = t.getBytesTransferred().get();
            long bps = elapsedSec > 0 ? transferred / elapsedSec : 0L;

            switch (t.getDirection()) {
                case UPLOAD -> currentUploadBps += bps;
                case DOWNLOAD -> currentDownloadBps += bps;
            }
        }

        return ThroughputInfo.builder()
                .currentUploadBytesPerSec(currentUploadBps)
                .currentDownloadBytesPerSec(currentDownloadBps)
                .totalUploadedBytes(totalUpload)
                .totalDownloadedBytes(totalDownload)
                .history(history)
                .build();
    }

    // Latency — SSH exec round-trip probes
    private LatencyInfo measureLatency(RemoteConnection conn) {
        if (!(conn instanceof RemoteShell shell)) {
            return LatencyInfo.unavailable();
        }
        double[] samples = new double[LATENCY_PROBES];
        int success = 0;
        for (int i = 0; i < LATENCY_PROBES; i++) {
            long start = System.nanoTime();
            try {
                shell.executeCommand("echo 1");
                samples[success++] = (System.nanoTime() - start) / 1_000_000.0; // → ms
            } catch (Exception e) {
                log.debug(
                        "[analytics] Latency probe {} failed for session {}: {}",
                        i,
                        conn.getSessionId(),
                        e.getMessage());
            }
        }
        if (success == 0) return LatencyInfo.unavailable();

        double[] valid = new double[success];
        System.arraycopy(samples, 0, valid, 0, success);

        double min = Double.MAX_VALUE, max = Double.MIN_VALUE, sum = 0;
        for (double v : valid) {
            if (v < min) min = v;
            if (v > max) max = v;
            sum += v;
        }
        return LatencyInfo.builder()
                .avgMs(sum / success)
                .minMs(min)
                .maxMs(max)
                .samplesCount(success)
                .unavailable(false)
                .build();
    }

    // Packet loss — local ICMP ping
    private PacketLossInfo measurePacketLoss(String host) {
        try {
            String os = System.getProperty("os.name", "").toLowerCase();
            ProcessBuilder pb = os.contains("mac") || os.contains("darwin")
                    ? new ProcessBuilder("ping", "-c", String.valueOf(PING_PACKETS), "-t", "3", host)
                    : new ProcessBuilder("ping", "-c", String.valueOf(PING_PACKETS), "-W", "3", host);
            pb.redirectErrorStream(true);
            Process proc = pb.start();

            String output;
            try (BufferedReader stdout = new BufferedReader(new InputStreamReader(proc.getInputStream()));
                    BufferedReader stderr = new BufferedReader(new InputStreamReader(proc.getErrorStream()))) {
                String out = stdout.lines().collect(Collectors.joining("\n"));
                String err = stderr.lines().collect(Collectors.joining("\n"));

                boolean finished = proc.waitFor(15, TimeUnit.SECONDS);

                if (!finished) {
                    proc.destroyForcibly();
                    throw new RuntimeException("Process timed out");
                }

                if (proc.exitValue() != 0) {
                    throw new RuntimeException("Process failed: " + err);
                }

                output = out;
            }

            // "5 packets transmitted, 3 received, 40% packet loss"
            Pattern p = Pattern.compile("(\\d+) packets? transmitted,\\s*(\\d+)\\s*(?:packets? )?received");
            Matcher m = p.matcher(output);
            if (m.find()) {
                int sent = Integer.parseInt(m.group(1));
                int received = Integer.parseInt(m.group(2));
                double loss = sent > 0 ? (sent - received) * 100.0 / sent : 0.0;
                return PacketLossInfo.builder()
                        .packetsSent(sent)
                        .packetsReceived(received)
                        .lossPercent(loss)
                        .unavailable(false)
                        .build();
            }
        } catch (Exception e) {
            if (e instanceof InterruptedException ie) {
                Thread.currentThread().interrupt();
                log.warn("[analytics] Packet-loss probe interrupted - {}", ie.getMessage());
            }
            log.debug("[analytics] Packet-loss probe failed (non-critical): {}", e.getMessage());
        }
        return PacketLossInfo.unavailable();
    }

    // System metrics — SSH remote commands
    private SystemMetricsInfo collectSystemMetrics(RemoteConnection conn) {
        if (!(conn instanceof RemoteShell shell)) {
            return SystemMetricsInfo.unavailable();
        }
        try {
            // CPU: lifetime average from /proc/stat (single-shot, no sleep needed)
            String cpuOut = safeExec(
                    shell,
                    "cat /proc/stat 2>/dev/null | awk 'NR==1{"
                            + "idle=$5; total=0; for(i=2;i<=NF;i++) total+=$i;"
                            + "printf \"%.1f\", 100*(total-idle)/total}'");

            // Memory: total and used bytes
            String memOut = safeExec(shell, "free -b 2>/dev/null | awk '/^Mem:/{print $2, $3}'");

            // Disk: size and used bytes for root filesystem
            String diskOut = safeExec(shell, "df -B1 / 2>/dev/null | awk 'NR==2{print $2, $3}'");

            Double cpuPercent = parseDouble(cpuOut);
            Long[] mem = parseLongPair(memOut); // [total, used]
            Long[] disk = parseLongPair(diskOut); // [total, used]

            Double memPercent = (mem[0] != null && mem[1] != null && mem[0] > 0) ? mem[1] * 100.0 / mem[0] : null;
            Double diskPercent = (disk[0] != null && disk[1] != null && disk[0] > 0) ? disk[1] * 100.0 / disk[0] : null;

            return SystemMetricsInfo.builder()
                    .cpuPercent(cpuPercent)
                    .memoryUsedPercent(memPercent)
                    .memoryUsedBytes(mem[1])
                    .memoryTotalBytes(mem[0])
                    .diskUsedPercent(diskPercent)
                    .diskUsedBytes(disk[1])
                    .diskTotalBytes(disk[0])
                    .unavailable(false)
                    .build();
        } catch (Exception e) {
            log.warn("[analytics] System-metrics probe failed for session {}: {}", conn.getSessionId(), e.getMessage());
            return SystemMetricsInfo.unavailable();
        }
    }

    // Connected nodes — all owner sessions, with optional CPU probe
    private List<ConnectedNodeInfo> buildConnectedNodes(UUID ownerId) {
        List<RemoteConnection> sessions = sessionRegistry.getByOwner(ownerId);
        List<ConnectedNodeInfo> nodes = new ArrayList<>(sessions.size());

        for (RemoteConnection conn : sessions) {
            RemoteSession s = conn.getSession();
            Double cpu = null;

            if (conn instanceof RemoteShell shell) {
                String cpuOut = safeExec(
                        shell,
                        "cat /proc/stat 2>/dev/null | awk 'NR==1{"
                                + "idle=$5; total=0; for(i=2;i<=NF;i++) total+=$i;"
                                + "printf \"%.1f\", 100*(total-idle)/total}'");
                cpu = parseDouble(cpuOut);
            }

            nodes.add(ConnectedNodeInfo.builder()
                    .sessionId(s.getSessionId())
                    .label(s.getLabel() != null && !s.getLabel().isBlank() ? s.getLabel() : s.getHost())
                    .host(s.getHost())
                    .username(s.getUsername())
                    .port(s.getPort())
                    .state(s.getState())
                    .createdAt(s.getCreatedAt())
                    .remoteOs(s.getRemoteOs())
                    .cpuPercent(cpu)
                    .build());
        }
        return nodes;
    }

    private SessionMetadataInfo buildSessionMetadata(RemoteConnection conn, RemoteSession session) {
        Long pid = null;
        String cipher = "SSH-2.0 Transport";

        if (conn instanceof RemoteShell shell) {
            // Remote sshd child PID — parent of the current shell
            String pidOut = safeExec(shell, "echo $PPID 2>/dev/null");
            if (!pidOut.isBlank()) {
                try {
                    pid = Long.parseLong(pidOut.trim());
                } catch (NumberFormatException ignored) {
                }
            }
        }
        if (conn instanceof SshRemoteConnection sshConn) {
            String c = sshConn.getCipherName();
            if (c != null && !c.isBlank()) cipher = c;
        }

        return SessionMetadataInfo.builder()
                .processPid(pid)
                .port(session.getPort())
                .sshCipher(cipher)
                .encryption("AES-256-GCM")
                .tunnelMode("Direct P2P")
                .lastHeartbeat(metricsStore.getLastActivity(session.getSessionId()))
                .region(resolveRegion(session.getHost()))
                .remoteOs(session.getRemoteOs())
                .build();
    }

    /**
     * Runs an SSH exec command, swallowing all exceptions and returning empty string on failure.
     */
    private String safeExec(RemoteShell shell, String command) {
        try {
            String result = shell.executeCommand(command);
            return result == null ? "" : result.trim();
        } catch (Exception e) {
            return "";
        }
    }

    private Double parseDouble(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return Double.parseDouble(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * Parses {@code "value1 value2"} → {@code [Long, Long]}; entries are {@code null} on parse
     * failure.
     */
    private Long[] parseLongPair(String s) {
        Long[] result = {null, null};
        if (s == null || s.isBlank()) return result;
        String[] parts = s.trim().split("\\s+");
        if (parts.length >= 1) {
            try {
                result[0] = Long.parseLong(parts[0]);
            } catch (NumberFormatException ignored) {
            }
        }
        if (parts.length >= 2) {
            try {
                result[1] = Long.parseLong(parts[1]);
            } catch (NumberFormatException ignored) {
            }
        }
        return result;
    }

    /**
     * Attempts to derive a human-readable region string from the remote hostname. Checks for AWS
     * and GCP hostname patterns; falls back to a reverse-DNS lookup.
     */
    private String resolveRegion(String host) {
        try {
            // AWS: *.us-west-2.compute.amazonaws.com or *.us-east-1.compute.internal
            Matcher awsMatcher = Pattern.compile("\\.([-a-z]+-[0-9]+)\\.(?:compute|amazonaws)")
                    .matcher(host);
            if (awsMatcher.find()) return awsMatcher.group(1).toUpperCase();

            // GCP: *.us-central1-a.c.<project>.internal
            Matcher gcpMatcher =
                    Pattern.compile("\\.([-a-z0-9]+)\\.c\\.[^.]+\\.internal").matcher(host);
            if (gcpMatcher.find()) return gcpMatcher.group(1).toUpperCase();

            // Azure: *.westus2.cloudapp.azure.com
            Matcher azureMatcher =
                    Pattern.compile("\\.([-a-z0-9]+)\\.cloudapp\\.azure\\.com").matcher(host);
            if (azureMatcher.find()) return azureMatcher.group(1).toUpperCase();

            // Reverse-DNS fallback (best-effort, bounded)
            InetAddress addr = InetAddress.getByName(host);
            String reversed = addr.getCanonicalHostName();
            return reversed.equals(host) ? null : reversed;
        } catch (Exception e) {
            log.debug("[analytics] Region resolution failed for {}: {}", host, e.getMessage());
            return null;
        }
    }

    private static String formatDuration(long totalSeconds) {
        long h = totalSeconds / 3600;
        long m = (totalSeconds % 3600) / 60;
        long s = totalSeconds % 60;
        return String.format("%02d:%02d:%02d", h, m, s);
    }

    @Override
    public AnalyticsHistoryResponse getAnalyticsHistory(
            String sessionId, UUID requestingUserId, OffsetDateTime from, OffsetDateTime to, int limit) {

        // Ownership is enforced inside the repository (user_id filter) so no
        // registry look-up is needed — the session may already be closed.
        List<SessionAnalyticsResponse> snapshots =
                snapshotRepository.findBySessionId(sessionId, requestingUserId, from, to, limit);

        boolean more = snapshots.size() == limit
                && snapshotRepository.hasMore(sessionId, requestingUserId, from, to, snapshots.size());

        return AnalyticsHistoryResponse.builder()
                .sessionId(sessionId)
                .count(snapshots.size())
                .hasMore(more)
                .snapshots(snapshots)
                .build();
    }

    private void assertOwnership(RemoteConnection conn, UUID ownerId) {
        if (!ownerId.equals(conn.getSession().getOwnerId())) {
            throw new SessionAccessDeniedException(conn.getSessionId());
        }
    }
}
