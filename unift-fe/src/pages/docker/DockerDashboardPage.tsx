/**
 * Docker Dashboard — Overview panel showing container counts, resource usage,
 * active containers with live stats, and a recent activity feed.
 *
 * Design reference: designs/unift/docker_dashboard/screen.png
 *
 * Data source: DockerController.getOverview
 * via remoteConnectionAPI.getDockerOverview
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type {
  DockerOverview,
  DockerContainer,
  DockerContainerStats,
  ContainerActionResult,
} from '@/utils/remoteConnectionAPI';

const REFRESH_INTERVALS = [
  { label: 'Off', value: 0 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: '60s', value: 60000 },
] as const;

interface DockerDashboardPageProps {
  sessionId: string;
}

export function DockerDashboardPage({ sessionId }: DockerDashboardPageProps) {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<DockerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'cpu' | 'memory'>('name');
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await remoteConnectionAPI.getDockerOverview(sessionId);
      setOverview(res);
    } catch {
      setError('Failed to load Docker overview. Docker may not be available on this host.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (refreshInterval <= 0) return;

    let cancelled = false;
    let stop: (() => void) | null = null;
    void remoteConnectionAPI
      .streamDockerOverview(
        sessionId,
        refreshInterval,
        (res) => {
          setOverview(res);
          setError(null);
          setLoading(false);
        },
        () => {
          setError('Live Docker overview stream disconnected.');
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
  }, [refreshInterval, sessionId]);

  const handleContainerAction = useCallback(async (
    containerId: string,
    action: 'stop' | 'restart',
  ) => {
    setActionLoading(`${containerId}-${action}`);
    try {
      let result: ContainerActionResult;
      if (action === 'stop') {
        result = await remoteConnectionAPI.stopDockerContainer(sessionId, containerId);
      } else {
        result = await remoteConnectionAPI.restartDockerContainer(sessionId, containerId);
      }
      if (result.success) await fetchOverview();
    } catch {
      // Action failed
    } finally {
      setActionLoading(null);
    }
  }, [sessionId, fetchOverview]);

  const statsMap = useMemo(() => {
    const map = new Map<string, DockerContainerStats>();
    if (overview?.stats) {
      for (const s of overview.stats) {
        map.set(s.containerId, s);
      }
    }
    return map;
  }, [overview?.stats]);

  const sortedContainers = useMemo(() => {
    if (!overview?.runningContainers) return [];
    const arr = [...overview.runningContainers];

    if (sortBy === 'name') {
      arr.sort((a, b) => a.names.localeCompare(b.names));
    } else if (sortBy === 'cpu') {
      arr.sort((a, b) => {
        const cpuA = parseFloat(statsMap.get(a.id)?.cpuPercent?.replace('%', '') ?? '0');
        const cpuB = parseFloat(statsMap.get(b.id)?.cpuPercent?.replace('%', '') ?? '0');
        return cpuB - cpuA;
      });
    } else if (sortBy === 'memory') {
      arr.sort((a, b) => {
        const memA = statsMap.get(a.id)?.memoryUsage ?? '';
        const memB = statsMap.get(b.id)?.memoryUsage ?? '';
        return memB.localeCompare(memA);
      });
    }

    return arr;
  }, [overview?.runningContainers, statsMap, sortBy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
          />
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Loading Docker overview...
          </span>
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <span
            className="material-symbols-rounded"
            style={{ fontSize: '40px', color: 'var(--color-text-muted)', fontVariationSettings: "'FILL' 0, 'wght' 200" }}
          >
            error_outline
          </span>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {error ?? 'Docker overview unavailable'}
          </span>
          <button
            onClick={fetchOverview}
            className="mt-2 px-4 py-1.5 rounded-md font-semibold cursor-pointer"
            style={{
              fontSize: '11px',
              background: 'var(--color-primary)',
              color: '#fff',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { info, stats: containerStats } = overview;

  const aggregatedCpu = containerStats.reduce((sum, s) => {
    return sum + parseFloat(s.cpuPercent?.replace('%', '') ?? '0');
  }, 0);

  const aggregatedMem = containerStats.reduce(
    (acc, s) => {
      const parts = s.memoryUsage?.split('/');
      if (parts && parts.length === 2) {
        acc.used += parseMemValue(parts[0].trim());
        acc.limit += parseMemValue(parts[1].trim());
      }
      return acc;
    },
    { used: 0, limit: 0 },
  );

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Stat Cards Row */}
      <div className="grid grid-cols-5 gap-3 px-6 pt-5 pb-4">
        <StatCard
          icon="view_in_ar"
          label="Total"
          value={String(info.totalContainers)}
          subLabel="Containers"
        />
        <StatCard
          icon="play_arrow"
          label="Running"
          value={String(info.runningContainers).padStart(2, '0')}
          subLabel="Active"
          valueColor="#4ade80"
          iconColor="#4ade80"
          iconBg="rgba(74,222,128,0.12)"
        />
        <StatCard
          icon="stop"
          label="Stopped"
          value={String(info.stoppedContainers + info.pausedContainers).padStart(2, '0')}
          subLabel="Paused"
          valueColor="#f87171"
          iconColor="#f87171"
          iconBg="rgba(248,113,113,0.12)"
        />
        <CpuCard percent={aggregatedCpu} containerCount={containerStats.length} />
        <MemoryCard used={aggregatedMem.used} limit={aggregatedMem.limit} />
      </div>

      {/* Main Content — Active Containers + Activity Sidebar */}
      <div className="flex-1 flex gap-4 px-6 pb-5 min-h-0">
        {/* Active Containers Section */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2
              className="font-bold"
              style={{ fontSize: '16px', color: 'var(--color-text-primary)' }}
            >
              Active Containers
            </h2>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }} className="uppercase tracking-[0.1em]">
                Sort by:
              </span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'name' | 'cpu' | 'memory')}
                className="rounded-md px-2 py-1 cursor-pointer"
                style={{
                  fontSize: '11px',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-muted)',
                  outline: 'none',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <option value="name">Name</option>
                <option value="cpu">CPU</option>
                <option value="memory">Memory</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-auto flex flex-col gap-2">
            {sortedContainers.length === 0 ? (
              <div
                className="flex-1 flex items-center justify-center rounded-lg"
                style={{ border: '1px solid var(--color-border-muted)' }}
              >
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  No running containers
                </span>
              </div>
            ) : (
              sortedContainers.map(c => (
                <ContainerCard
                  key={c.id}
                  container={c}
                  stats={statsMap.get(c.id)}
                  actionLoading={actionLoading}
                  onStop={() => handleContainerAction(c.id, 'stop')}
                  onRestart={() => handleContainerAction(c.id, 'restart')}
                  onLogs={() => navigate(`/workspace/${sessionId}/docker/containers`)}
                />
              ))
            )}
          </div>

          {/* View All link */}
          {sortedContainers.length > 0 && (
            <button
              onClick={() => navigate(`/workspace/${sessionId}/docker/containers`)}
              className="mt-3 text-left cursor-pointer"
              style={{ fontSize: '11px', color: 'var(--color-primary)' }}
            >
              View all containers &rarr;
            </button>
          )}
        </div>

        {/* Right Sidebar — Activity + Volume */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-4">
          {/* Docker Info Card */}
          <div
            className="rounded-lg p-4"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="font-semibold uppercase tracking-[0.1em]"
                style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
              >
                Docker Engine
              </span>
              <span
                className="px-2 py-0.5 rounded-full font-semibold uppercase tracking-[0.08em]"
                style={{ fontSize: '9px', background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}
              >
                Active
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <InfoRow label="Version" value={info.version ?? '-'} />
              <InfoRow label="API" value={info.version ? `v${info.version.split('.').slice(0, 2).join('.')}` : '-'} />
              <InfoRow label="OS / Arch" value={info.serverOs ?? '-'} />
              <InfoRow label="Storage" value={info.storageDriver ?? '-'} />
              <InfoRow label="Images" value={String(info.totalImages)} />
            </div>
          </div>

          {/* Resource Summary */}
          <div
            className="rounded-lg p-4"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
          >
            <span
              className="font-semibold uppercase tracking-[0.1em]"
              style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
            >
              Resource Summary
            </span>
            <div className="mt-3 flex flex-col gap-3">
              <ResourceBar
                label="CPU"
                percent={Math.min(aggregatedCpu, 100)}
                value={`${aggregatedCpu.toFixed(1)}%`}
                color="#7C6DFA"
              />
              <ResourceBar
                label="Memory"
                percent={aggregatedMem.limit > 0 ? (aggregatedMem.used / aggregatedMem.limit) * 100 : 0}
                value={formatBytes(aggregatedMem.used)}
                color="#66d9cc"
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div
            className="rounded-lg p-4"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
          >
            <span
              className="font-semibold uppercase tracking-[0.1em] block mb-3"
              style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
            >
              Quick Actions
            </span>
            <div className="flex flex-col gap-1.5">
              <QuickAction
                icon="view_in_ar"
                label="Manage Containers"
                onClick={() => navigate(`/workspace/${sessionId}/docker/containers`)}
              />
              <QuickAction
                icon="layers"
                label="Manage Images"
                onClick={() => navigate(`/workspace/${sessionId}/docker/images`)}
              />
              <QuickAction
                icon="hub"
                label="Networks"
                onClick={() => navigate(`/workspace/${sessionId}/docker/networks`)}
              />
              <QuickAction
                icon="hard_drive"
                label="Volumes"
                onClick={() => navigate(`/workspace/${sessionId}/docker/volumes`)}
              />
              <QuickAction
                icon="refresh"
                label="Refresh Overview"
                onClick={fetchOverview}
              />
            </div>
          </div>

          {/* Auto Refresh */}
          <div
            className="rounded-lg p-4"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
          >
            <span
              className="font-semibold uppercase tracking-[0.1em] block mb-3"
              style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
            >
              Auto Refresh
            </span>
            <div className="flex items-center gap-1">
              {REFRESH_INTERVALS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRefreshInterval(opt.value)}
                  className="px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors"
                  style={{
                    fontSize: '10px',
                    background: refreshInterval === opt.value ? 'var(--color-primary)' : 'transparent',
                    color: refreshInterval === opt.value ? '#fff' : 'var(--color-text-muted)',
                    border: refreshInterval === opt.value ? 'none' : '1px solid var(--color-border-muted)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-components

function StatCard({
  icon,
  label,
  value,
  subLabel,
  valueColor = 'var(--color-text-primary)',
  iconColor = 'var(--color-primary)',
  iconBg = 'rgba(124,109,250,0.12)',
}: {
  icon: string;
  label: string;
  value: string;
  subLabel: string;
  valueColor?: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <div
      className="rounded-lg px-4 py-4 flex items-center gap-3"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg }}
      >
        <span
          className="material-symbols-rounded"
          style={{ fontSize: '20px', color: iconColor, fontVariationSettings: "'FILL' 0, 'wght' 300" }}
        >
          {icon}
        </span>
      </div>
      <div>
        <p
          className="uppercase tracking-[0.1em] font-semibold"
          style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}
        >
          {label}
        </p>
        <p className="font-bold" style={{ fontSize: '22px', color: valueColor, lineHeight: '1.2' }}>
          {value}
        </p>
        <p style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{subLabel}</p>
      </div>
    </div>
  );
}

function CpuCard({ percent, containerCount }: { percent: number; containerCount: number }) {
  return (
    <div
      className="rounded-lg px-4 py-4"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="uppercase tracking-[0.1em] font-semibold"
          style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}
        >
          CPU Usage
        </span>
        <span className="font-bold font-mono" style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
          {percent.toFixed(0)}%
        </span>
      </div>
      <div
        className="w-full h-1 rounded-full mt-2 mb-1.5"
        style={{ background: 'var(--color-bg-base)' }}
      >
        <div
          className="h-1 rounded-full transition-all"
          style={{ width: `${Math.min(percent, 100)}%`, background: '#7C6DFA' }}
        />
      </div>
      <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>
        Across {containerCount} containers
      </span>
    </div>
  );
}

function MemoryCard({ used, limit }: { used: number; limit: number }) {
  const percent = limit > 0 ? (used / limit) * 100 : 0;
  return (
    <div
      className="rounded-lg px-4 py-4"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="uppercase tracking-[0.1em] font-semibold"
          style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}
        >
          Memory
        </span>
        <span className="font-bold font-mono" style={{ fontSize: '12px', color: '#66d9cc' }}>
          {formatBytes(used)}{limit > 0 ? ` / ${formatBytes(limit)}` : ''}
        </span>
      </div>
      <div
        className="w-full h-1 rounded-full mt-2 mb-1.5"
        style={{ background: 'var(--color-bg-base)' }}
      >
        <div
          className="h-1 rounded-full transition-all"
          style={{ width: `${Math.min(percent, 100)}%`, background: '#66d9cc' }}
        />
      </div>
      <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>
        {percent.toFixed(0)}% utilized
      </span>
    </div>
  );
}

function ContainerCard({
  container,
  stats,
  actionLoading,
  onStop,
  onRestart,
  onLogs,
}: {
  container: DockerContainer;
  stats?: DockerContainerStats;
  actionLoading: string | null;
  onStop: () => void;
  onRestart: () => void;
  onLogs: () => void;
}) {
  const name = container.names.replace(/^\//, '');
  const uptime = container.status?.match(/Up\s+(.+)/i)?.[1] ?? container.status;

  return (
    <div
      className="flex items-center gap-4 rounded-lg px-4 py-3 transition-colors"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-muted)')}
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(124,109,250,0.08)' }}
      >
        <span
          className="material-symbols-rounded"
          style={{ fontSize: '18px', color: 'var(--color-primary)', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
        >
          dns
        </span>
      </div>

      {/* Name + Image */}
      <div className="flex-1 min-w-0">
        <p
          className="font-semibold truncate"
          style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}
        >
          {name}
        </p>
        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          Image: <span className="font-mono">{container.image}</span>
          <span className="ml-2">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
              style={{ background: '#4ade80' }}
            />
            <span style={{ color: '#4ade80' }}>Up {uptime}</span>
          </span>
        </p>
      </div>

      {/* CPU */}
      <div className="text-right flex-shrink-0 w-16">
        <p
          className="uppercase tracking-[0.1em] font-semibold"
          style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}
        >
          CPU
        </p>
        <p
          className="font-bold font-mono"
          style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}
        >
          {stats?.cpuPercent ?? '-'}
        </p>
      </div>

      {/* Memory */}
      <div className="text-right flex-shrink-0 w-16">
        <p
          className="uppercase tracking-[0.1em] font-semibold"
          style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}
        >
          Memory
        </p>
        <p
          className="font-bold font-mono"
          style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}
        >
          {stats ? formatMemShort(stats.memoryUsage) : '-'}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <MiniActionButton
          icon="stop"
          title="Stop"
          loading={actionLoading === `${container.id}-stop`}
          onClick={onStop}
        />
        <MiniActionButton
          icon="restart_alt"
          title="Restart"
          loading={actionLoading === `${container.id}-restart`}
          onClick={onRestart}
        />
        <MiniActionButton
          icon="description"
          title="Logs"
          loading={false}
          onClick={onLogs}
        />
      </div>
    </div>
  );
}

function MiniActionButton({
  icon,
  title,
  loading,
  onClick,
}: {
  icon: string;
  title: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={loading}
      title={title}
      className="w-6 h-6 rounded flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40"
      style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(124,109,250,0.08)';
        e.currentTarget.style.color = 'var(--color-primary)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--color-text-muted)';
      }}
    >
      {loading ? (
        <div
          className="w-3 h-3 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
        />
      ) : (
        <span
          className="material-symbols-rounded"
          style={{ fontSize: '14px', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
        >
          {icon}
        </span>
      )}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
        {value}
      </span>
    </div>
  );
}

function ResourceBar({
  label,
  percent,
  value,
  color,
}: {
  label: string;
  percent: number;
  value: string;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{label}</span>
        <span className="font-mono font-semibold" style={{ fontSize: '11px', color }}>
          {value}
        </span>
      </div>
      <div
        className="w-full h-1 rounded-full"
        style={{ background: 'var(--color-bg-base)' }}
      >
        <div
          className="h-1 rounded-full transition-all"
          style={{ width: `${Math.min(percent, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md cursor-pointer transition-colors text-left"
      style={{ background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,109,250,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        className="material-symbols-rounded"
        style={{ fontSize: '16px', color: 'var(--color-primary)', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
      >
        {icon}
      </span>
      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{label}</span>
    </button>
  );
}

// Utilities

function parseMemValue(str: string): number {
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  if (str.includes('GiB') || str.includes('GB')) return num * 1024 * 1024 * 1024;
  if (str.includes('MiB') || str.includes('MB')) return num * 1024 * 1024;
  if (str.includes('KiB') || str.includes('KB')) return num * 1024;
  if (str.includes('B')) return num;
  return num;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
}

function formatMemShort(usage: string | undefined): string {
  if (!usage) return '-';
  const parts = usage.split('/');
  return parts[0]?.trim() ?? usage;
}
