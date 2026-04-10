/**
 * SSH Session Monitoring — Displays live analytics for an active SSH session
 * including latency, packet loss, throughput, system metrics, traffic history,
 * and connection metadata via SSE push updates.
 *
 * Data source: remoteConnectionAPI.getSessionAnalytics(sessionId)
 */
import { useCallback, useEffect, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { SessionAnalyticsResponse, TrafficDataPoint } from '@/utils/remoteConnectionAPI';

interface SshMonitoringPageProps {
  sessionId: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function latencyColor(ms: number): string {
  if (ms < 50) return '#4ade80';
  if (ms < 200) return '#facc15';
  return '#f87171';
}

function percentColor(pct: number): string {
  if (pct < 60) return '#4ade80';
  if (pct < 85) return '#facc15';
  return '#f87171';
}

function StateBadge({ state }: { state: string }) {
  const color = state === 'ACTIVE' ? '#4ade80' : state === 'CLOSED' ? '#94a3b8' : '#f87171';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: `${color}20`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {state}
    </span>
  );
}

function ProgressBar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span className="text-xs font-medium" style={{ color }}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-border-muted)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function MetricCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-rounded" style={{ fontSize: 18, color: 'var(--color-primary)' }}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function TrafficHistory({ points }: { points: TrafficDataPoint[] }) {
  if (points.length === 0) {
    return <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No traffic data available</span>;
  }
  const recent = points.slice(-15);
  return (
    <div className="flex flex-col gap-1 max-h-48 overflow-auto">
      <div className="grid grid-cols-3 gap-2 text-xs font-semibold pb-1 border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-muted)' }}>
        <span>Time</span>
        <span>Upload</span>
        <span>Download</span>
      </div>
      {recent.map((pt, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <span>{new Date(pt.timestamp).toLocaleTimeString()}</span>
          <span>{formatSpeed(pt.uploadBytesPerSec)}</span>
          <span>{formatSpeed(pt.downloadBytesPerSec)}</span>
        </div>
      ))}
    </div>
  );
}

function MetadataSection({ data }: { data: SessionAnalyticsResponse }) {
  const { metadata } = data;
  const items = [
    { label: 'Cipher', value: metadata.sshCipher ?? 'N/A' },
    { label: 'Encryption', value: metadata.encryption ?? 'N/A' },
    { label: 'Tunnel Mode', value: metadata.tunnelMode ?? 'N/A' },
    { label: 'Remote OS', value: metadata.remoteOs ?? 'N/A' },
    { label: 'PID', value: metadata.processPid != null ? String(metadata.processPid) : 'N/A' },
    { label: 'Port', value: String(metadata.port) },
    { label: 'Region', value: metadata.region ?? 'N/A' },
    { label: 'Last Heartbeat', value: metadata.lastHeartbeat ? new Date(metadata.lastHeartbeat).toLocaleString() : 'N/A' },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
      {items.map(item => (
        <div key={item.label} className="flex items-center justify-between py-1 border-b" style={{ borderColor: 'var(--color-border-muted)' }}>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.label}</span>
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SshMonitoringPage({ sessionId }: SshMonitoringPageProps) {
  const [analytics, setAnalytics] = useState<SessionAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await remoteConnectionAPI.getSessionAnalytics(sessionId);
      setAnalytics(res);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError('Failed to load session analytics.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    let stop: (() => void) | null = null;
    fetchAnalytics();
    void remoteConnectionAPI
      .streamSessionAnalytics(
        sessionId,
        5000,
        (res) => {
          setAnalytics(res);
          setLastUpdated(new Date());
          setError(null);
          setLoading(false);
        },
        () => {
          setError('Live analytics stream disconnected.');
        },
      )
      .then((s) => {
        stop = s;
      });

    return () => {
      stop?.();
    };
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading session analytics...</span>
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-rounded" style={{ fontSize: 40, color: 'var(--color-text-muted)' }}>error_outline</span>
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{error ?? 'Analytics unavailable'}</span>
          <button onClick={fetchAnalytics} className="mt-2 px-4 py-1.5 rounded-md font-semibold cursor-pointer" style={{ fontSize: 11, background: 'var(--color-primary)', color: '#fff' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { latency, packetLoss, throughput, systemMetrics, trafficAnalysis } = analytics;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h1 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Session Monitoring</h1>
        {lastUpdated && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Connection Info Row */}
      <div className="flex items-center gap-4 px-6 pb-4">
        <InfoPill label="Host" value={analytics.host} />
        <InfoPill label="User" value={analytics.username} />
        <InfoPill label="Duration" value={analytics.sessionDurationFormatted} />
        <StateBadge state={analytics.state} />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-4 px-6 pb-4">
        <MetricCard title="Latency" icon="speed">
          {latency.unavailable ? (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Metrics unavailable</span>
          ) : (
            <div className="flex flex-col gap-2">
              <LatencyRow label="Average" value={latency.avgMs} />
              <LatencyRow label="Min" value={latency.minMs} />
              <LatencyRow label="Max" value={latency.maxMs} />
              <span className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{latency.samplesCount} samples</span>
            </div>
          )}
        </MetricCard>

        <MetricCard title="Packet Loss" icon="signal_cellular_connected_no_internet_0_bar">
          {packetLoss.unavailable ? (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Metrics unavailable</span>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-2xl font-bold" style={{ color: packetLoss.lossPercent > 5 ? '#f87171' : packetLoss.lossPercent > 1 ? '#facc15' : '#4ade80' }}>
                {packetLoss.lossPercent.toFixed(2)}%
              </span>
              <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <span>Sent: {packetLoss.packetsSent.toLocaleString()}</span>
                <span>Received: {packetLoss.packetsReceived.toLocaleString()}</span>
              </div>
            </div>
          )}
        </MetricCard>

        <MetricCard title="Throughput" icon="swap_vert">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-rounded text-sm" style={{ color: '#60a5fa' }}>arrow_upward</span>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {formatSpeed(throughput.currentUploadBytesPerSec)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-rounded text-sm" style={{ color: '#4ade80' }}>arrow_downward</span>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {formatSpeed(throughput.currentDownloadBytesPerSec)}
              </span>
            </div>
            <div className="flex gap-4 text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              <span>Total up: {formatBytes(throughput.totalUploadedBytes)}</span>
              <span>Total down: {formatBytes(throughput.totalDownloadedBytes)}</span>
            </div>
          </div>
        </MetricCard>
      </div>

      {/* System Metrics */}
      <div className="px-6 pb-4">
        <MetricCard title="System Metrics" icon="memory">
          {systemMetrics.unavailable ? (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>System metrics unavailable on this host</span>
          ) : (
            <div className="flex flex-col gap-3">
              {systemMetrics.cpuPercent != null && (
                <ProgressBar value={systemMetrics.cpuPercent} max={100} label="CPU" color={percentColor(systemMetrics.cpuPercent)} />
              )}
              {systemMetrics.memoryUsedBytes != null && systemMetrics.memoryTotalBytes != null && (
                <div className="flex flex-col gap-1">
                  <ProgressBar
                    value={systemMetrics.memoryUsedBytes}
                    max={systemMetrics.memoryTotalBytes}
                    label={`Memory — ${formatBytes(systemMetrics.memoryUsedBytes)} / ${formatBytes(systemMetrics.memoryTotalBytes)}`}
                    color={percentColor(systemMetrics.memoryUsedPercent ?? 0)}
                  />
                </div>
              )}
              {systemMetrics.diskUsedBytes != null && systemMetrics.diskTotalBytes != null && (
                <ProgressBar
                  value={systemMetrics.diskUsedBytes}
                  max={systemMetrics.diskTotalBytes}
                  label={`Disk — ${formatBytes(systemMetrics.diskUsedBytes)} / ${formatBytes(systemMetrics.diskTotalBytes)}`}
                  color={percentColor(systemMetrics.diskUsedPercent ?? 0)}
                />
              )}
            </div>
          )}
        </MetricCard>
      </div>

      {/* Traffic History */}
      <div className="px-6 pb-4">
        <MetricCard title="Traffic History" icon="timeline">
          <TrafficHistory points={trafficAnalysis} />
        </MetricCard>
      </div>

      {/* Metadata */}
      <div className="px-6 pb-6">
        <MetricCard title="Connection Metadata" icon="info">
          <MetadataSection data={analytics} />
        </MetricCard>
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}:</span>
      <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );
}

function LatencyRow({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: latencyColor(value) }}>{value.toFixed(1)} ms</span>
    </div>
  );
}
