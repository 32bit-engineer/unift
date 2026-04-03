/**
 * Docker Monitoring — Aggregated resource usage for all Docker containers.
 * Shows Docker system info, per-container stats table with color-coded
 * resource bars, and summary row. Receives live updates via SSE.
 *
 * Data source: remoteConnectionAPI.getDockerInfo + getDockerContainerStats
 */
import { useCallback, useEffect, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { DockerInfo, DockerContainerStats } from '@/utils/remoteConnectionAPI';

interface DockerMonitoringPageProps {
  sessionId: string;
}

function parsePercent(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace('%', '')) || 0;
}

function percentColor(pct: number): string {
  if (pct < 50) return '#4ade80';
  if (pct < 80) return '#facc15';
  return '#f87171';
}

function MiniBar({ percent, color }: { percent: number; color: string }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border-muted)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${clamped}%`, background: color }} />
      </div>
      <span className="text-xs font-medium w-10 text-right" style={{ color }}>{clamped.toFixed(1)}%</span>
    </div>
  );
}

function SystemInfoCard({ info }: { info: DockerInfo }) {
  const items = [
    { label: 'Docker Version', value: info.version || 'N/A' },
    { label: 'Server OS', value: info.serverOs || 'N/A' },
    { label: 'Storage Driver', value: info.storageDriver || 'N/A' },
    { label: 'Total Containers', value: String(info.totalContainers) },
    { label: 'Running', value: String(info.runningContainers) },
    { label: 'Stopped', value: String(info.stoppedContainers) },
    { label: 'Total Images', value: String(info.totalImages) },
  ];

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-rounded" style={{ fontSize: 18, color: 'var(--color-primary)' }}>info</span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Docker System</span>
      </div>
      <div className="grid grid-cols-4 gap-x-6 gap-y-2">
        {items.map(item => (
          <div key={item.label} className="flex flex-col gap-0.5">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.label}</span>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContainerStatsTable({ stats }: { stats: DockerContainerStats[] }) {
  if (stats.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No running containers</span>
      </div>
    );
  }

  const totalCpu = stats.reduce((sum, s) => sum + parsePercent(s.cpuPercent), 0);
  const totalMem = stats.reduce((sum, s) => sum + parsePercent(s.memoryPercent), 0);
  const avgCpu = stats.length > 0 ? totalCpu / stats.length : 0;

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--color-border-muted)' }}>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>Container</th>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>CPU %</th>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>Memory</th>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>Mem %</th>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>Net I/O</th>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>Block I/O</th>
          </tr>
        </thead>
        <tbody>
          {stats.map(s => {
            const cpuPct = parsePercent(s.cpuPercent);
            const memPct = parsePercent(s.memoryPercent);
            return (
              <tr key={s.containerId} className="border-b" style={{ borderColor: 'var(--color-border-muted)' }}>
                <td className="py-2 px-2 font-medium truncate max-w-[160px]" style={{ color: 'var(--color-text-primary)' }}>{s.name}</td>
                <td className="py-2 px-2"><MiniBar percent={cpuPct} color={percentColor(cpuPct)} /></td>
                <td className="py-2 px-2" style={{ color: 'var(--color-text-secondary)' }}>
                  {s.memoryUsage ?? 'N/A'}
                </td>
                <td className="py-2 px-2"><MiniBar percent={memPct} color={percentColor(memPct)} /></td>
                <td className="py-2 px-2" style={{ color: 'var(--color-text-secondary)' }}>{s.networkIo ?? 'N/A'}</td>
                <td className="py-2 px-2" style={{ color: 'var(--color-text-secondary)' }}>{s.blockIo ?? 'N/A'}</td>
              </tr>
            );
          })}
          {/* Summary row */}
          <tr style={{ background: 'var(--color-surface)' }}>
            <td className="py-2 px-2 font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Summary ({stats.length} containers)
            </td>
            <td className="py-2 px-2">
              <span className="text-xs font-semibold" style={{ color: percentColor(avgCpu) }}>
                Avg: {avgCpu.toFixed(1)}% / Total: {totalCpu.toFixed(1)}%
              </span>
            </td>
            <td className="py-2 px-2" />
            <td className="py-2 px-2">
              <span className="text-xs font-semibold" style={{ color: percentColor(totalMem / stats.length) }}>
                Avg: {(totalMem / stats.length).toFixed(1)}%
              </span>
            </td>
            <td className="py-2 px-2" />
            <td className="py-2 px-2" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function DockerMonitoringPage({ sessionId }: DockerMonitoringPageProps) {
  const [info, setInfo] = useState<DockerInfo | null>(null);
  const [stats, setStats] = useState<DockerContainerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await remoteConnectionAPI.getDockerOverview(sessionId);
      setInfo(res.info);
      setStats(res.stats);

      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError('Failed to load Docker monitoring data.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchData();

    let cancelled = false;
    let stop: (() => void) | null = null;
    void remoteConnectionAPI
      .streamDockerOverview(
        sessionId,
        5000,
        (overview) => {
          setInfo(overview.info);
          setStats(overview.stats);
          setLastUpdated(new Date());
          setError(null);
          setLoading(false);
        },
        () => {
          setError('Live Docker stream disconnected.');
        },
      )
      .then((s) => {
        if (cancelled) {
          s();
        } else {
          stop = s;
        }
      });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading Docker monitoring...</span>
        </div>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-rounded" style={{ fontSize: 40, color: 'var(--color-text-muted)' }}>error_outline</span>
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{error}</span>
          <button onClick={fetchData} className="mt-2 px-4 py-1.5 rounded-md font-semibold cursor-pointer" style={{ fontSize: 11, background: 'var(--color-primary)', color: '#fff' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h1 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Docker Monitoring</h1>
        {lastUpdated && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Live — {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {/* Docker System Info */}
      {info && (
        <div className="px-6 pb-4">
          <SystemInfoCard info={info} />
        </div>
      )}

      {/* Container Stats Table */}
      <div className="px-6 pb-6">
        <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-rounded" style={{ fontSize: 18, color: 'var(--color-primary)' }}>monitoring</span>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Container Resource Usage</span>
          </div>
          <ContainerStatsTable stats={stats} />
        </div>
      </div>
    </div>
  );
}
