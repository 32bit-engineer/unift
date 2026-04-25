/**
 * SshDockerDashboardPage — Combined SSH + Docker workspace dashboard.
 *
 * Design reference: Stitch project UniFT / "SSH + Docker Workspace"
 * (screen ID: 572247b7444d4956a36a637ff216b83f)
 *
 * Sections:
 *   • Bento metrics grid  → CPU, Memory, Latency
 *   • Active Containers   → live table from DockerDashboardPage pattern
 *   • System Logs         → tail stream
 *   • Disk / System Info  → static SSH system snapshot
 */
import { useEffect, useState, useCallback } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type {
  DockerContainer,
  DockerContainerStats,
} from '@/utils/remoteConnectionAPI';
import type { UIHost } from './RemoteHostsManager/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemSnapshot {
  os: string;
  kernel: string;
  arch: string;
  uptime: string;
  disk: { label: string; device: string; pct: number };
  ssl: boolean;
  firewall: boolean;
}

type TabId = 'overview' | 'terminal' | 'nginx' | 'logs';

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  unit,
  icon,
  iconColor,
  children,
}: {
  label: string;
  value: string;
  unit: string;
  icon: string;
  iconColor: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="md:col-span-2 p-4 rounded-xl bg-surface-container-low border-b border-surface-tint/10 flex flex-col justify-between h-40">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold font-headline mt-1">
            {value}
            <span className="text-lg font-medium opacity-40">{unit}</span>
          </p>
        </div>
        <span className={`material-symbols-outlined ${iconColor}`}>{icon}</span>
      </div>
      {children}
    </div>
  );
}

function CpuBars({ pct }: { pct: number }) {
  // Simple sparkbar: 9 bars scaling up to pct
  const bars = [20, 35, 25, 45, 30, 50, 60, 55, pct];
  return (
    <div className="flex items-end gap-1 h-12">
      {bars.map((h, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${i >= 6 ? 'bg-primary' : 'bg-surface-container-high'}`}
          style={{ height: `${h}%`, opacity: i >= 6 ? (0.4 + (i - 6) * 0.3) : 1 }}
        />
      ))}
    </div>
  );
}

function MemoryBar({ usedGb, totalGb }: { usedGb: number; totalGb: number }) {
  const pct = totalGb > 0 ? (usedGb / totalGb) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-mono text-outline-variant">
        <span>Used: {usedGb.toFixed(1)}GB</span>
        <span>Total: {totalGb.toFixed(1)}GB</span>
      </div>
      <div className="h-1 w-full bg-surface-container-high rounded-full overflow-hidden">
        <div className="h-full bg-tertiary rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DiskRing({ pct, label, device }: { pct: number; label: string; device: string }) {
  const r = 58;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);
  return (
    <div className="md:col-span-1 bg-surface-container-low/60 backdrop-blur-md p-6 rounded-xl flex flex-col items-center justify-center text-center space-y-4">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          <circle
            className="text-surface-container-high"
            cx="64" cy="64" r={r}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="8"
          />
          <circle
            className="text-primary"
            cx="64" cy="64" r={r}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{pct}%</span>
          <span className="text-[10px] text-outline-variant uppercase">Disk Used</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-bold">{label}</p>
        <p className="text-xs text-on-surface-variant font-mono">{device}</p>
      </div>
    </div>
  );
}

function ContainerStatusBadge({ status }: { status: string }) {
  const running = status.toLowerCase().includes('up') || status.toLowerCase() === 'running';
  const restarting = status.toLowerCase().includes('restart');
  if (restarting)
    return (
      <span className="text-error flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-error inline-block" />
        Restarting
      </span>
    );
  if (running)
    return (
      <span className="text-tertiary flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-tertiary inline-block" />
        Up
      </span>
    );
  return (
    <span className="text-outline flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-outline inline-block" />
      {status}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface SshDockerDashboardPageProps {
  session: UIHost;
  onConnect: () => void;
  onBack: () => void;
}

export function SshDockerDashboardPage({
  session,
  onConnect,
  onBack,
}: SshDockerDashboardPageProps) {
  const sessionId = session.sessionId;
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // — Docker containers stream (reuses pattern from DockerDashboardPage) ——————
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [stats, setStats] = useState<DockerContainerStats[]>([]);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;
    void remoteConnectionAPI
      .streamDockerRunningContainers(sessionId, 5000, setContainers, () => {})
      .then((s: () => void) => { if (cancelled) s(); else stop = s; });
    return () => { cancelled = true; stop?.(); };
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;
    void remoteConnectionAPI
      .streamDockerContainerStatsAll(sessionId, 3000, setStats, () => {})
      .then((s: () => void) => { if (cancelled) s(); else stop = s; });
    return () => { cancelled = true; stop?.(); };
  }, [sessionId]);

  // — Derive per-container stats map for quick lookup ————————————————————————
  const statsMap = new Map(stats.map((s) => [s.containerId, s]));

  // — Mock system snapshot (replace with SSH stream when API is available) ——
  const snapshot: SystemSnapshot = {
    os: 'Ubuntu 22.04.3 LTS',
    kernel: '5.15.0-89-generic',
    arch: 'x86_64 (64-bit)',
    uptime: '42 days, 11:23:45',
    disk: { label: 'SATA SSD 01', device: '/dev/sda1 (ext4)', pct: 72 },
    ssl: true,
    firewall: true,
  };

  // — Derived metrics from live stats ————————————————————————————————————————
  // cpuPercent / memoryUsage / memoryLimit are strings from the API (e.g. "12.5%", "256MiB / 1GiB")
  const parsePct = (v: string) => parseFloat(v?.replace('%', '') ?? '0') || 0;
  const parseMiB = (v: string) => parseFloat(v?.split(' ')[0] ?? '0') || 0;

  const totalCpuPct =
    stats.length > 0
      ? stats.reduce((acc, s) => acc + parsePct(s.cpuPercent), 0) / stats.length
      : 0;

  const totalMemUsed = stats.reduce((acc, s) => acc + parseMiB(s.memoryUsage), 0) / 1024;
  const totalMemLimit = stats.length > 0
    ? stats.reduce((acc, s) => acc + parseMiB(s.memoryLimit), 0) / 1024
    : 32;

  // ─── Tabs ────────────────────────────────────────────────────────────────
  const tabs: { id: TabId; icon: string; label: string }[] = [
    { id: 'overview', icon: 'monitoring', label: 'Overview' },
    { id: 'terminal', icon: 'terminal', label: 'Terminal' },
    { id: 'nginx', icon: 'description', label: 'nginx.conf' },
    { id: 'logs', icon: 'data_object', label: 'Docker Logs' },
  ];

  // ─── Container action ────────────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const handleContainerAction = useCallback(
    async (containerId: string, action: 'start' | 'stop' | 'restart') => {
      setActionLoading(containerId);
      try {
        if (action === 'start') await remoteConnectionAPI.startDockerContainer(sessionId, containerId);
        else if (action === 'stop') await remoteConnectionAPI.stopDockerContainer(sessionId, containerId);
        else await remoteConnectionAPI.restartDockerContainer(sessionId, containerId);
      } finally {
        setActionLoading(null);
      }
    },
    [sessionId],
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  const [sshUser, sshHost] = session.userAtIp?.includes('@')
    ? session.userAtIp.split('@')
    : ['root', session.userAtIp ?? ''];
  const sshAddress = sshHost
    ? `ssh ${sshUser}@${sshHost}${session.port && session.port !== 22 ? ` -p ${session.port}` : ''}`
    : '—';

  return (
    <div className="flex flex-col h-full bg-surface text-on-surface font-body overflow-hidden">

      {/* VS Code-style Tab Bar */}
      <div className="flex items-center bg-surface-container-low h-10 px-2 gap-px select-none shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 h-full text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-surface text-primary border-t-2 border-primary'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">{tab.icon}</span>
            {tab.label}
            <span className="material-symbols-outlined text-[14px] ml-2 opacity-40">close</span>
          </button>
        ))}
      </div>

      {/* Dashboard Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Server Header ────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs uppercase tracking-widest text-tertiary font-bold bg-tertiary/10 px-2 py-0.5 rounded">
                Running
              </span>
              <span className="text-xs font-mono text-outline-variant">
                {session.sessionId?.slice(0, 8)?.toUpperCase() ?? 'ID: —'}
              </span>
            </div>
            <h1 className="text-3xl font-bold font-headline text-on-surface tracking-tight">
              {session.label ?? session.name}
            </h1>
            <p className="text-on-surface-variant font-mono text-sm mt-1">{sshAddress}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onBack}
              className="bg-surface-container-high px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Back
            </button>
            <button
              onClick={onConnect}
              className="bg-linear-to-br from-primary-container to-primary px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-on-primary shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                terminal
              </span>
              Connect
            </button>
          </div>
        </div>

        {/* ── Metrics Bento Grid ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4">

          {/* CPU */}
          <MetricCard
            label="CPU Usage"
            value={totalCpuPct.toFixed(1)}
            unit="%"
            icon="memory"
            iconColor="text-primary"
          >
            <CpuBars pct={totalCpuPct} />
          </MetricCard>

          {/* Memory */}
          <MetricCard
            label="Memory"
            value={totalMemUsed > 0 ? totalMemUsed.toFixed(1) : '—'}
            unit="GB"
            icon="settings_input_component"
            iconColor="text-tertiary"
          >
            <MemoryBar usedGb={totalMemUsed} totalGb={totalMemLimit} />
          </MetricCard>

          {/* Latency — placeholder; swap with real RTT when stream available */}
          <MetricCard
            label="Net Latency"
            value="—"
            unit="ms"
            icon="speed"
            iconColor="text-on-surface-variant"
          >
            <div className="flex items-center gap-2 text-tertiary">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span className="text-xs font-medium">Connected</span>
            </div>
          </MetricCard>

          {/* ── Active Containers Table (spans 4 cols) ───────────────────── */}
          <div className="lg:col-span-4 p-6 rounded-xl bg-surface-container-low border-b border-surface-tint/10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl">developer_board</span>
                <h3 className="text-lg font-bold">Active Containers</h3>
              </div>
              <span className="text-xs bg-surface-container-high px-3 py-1 rounded-full text-on-surface-variant font-bold">
                {containers.filter((c) => c.state === 'running').length} Running
              </span>
            </div>
            <div className="overflow-x-auto">
              {containers.length === 0 ? (
                <p className="text-sm text-outline text-center py-8">No containers found</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] text-outline-variant uppercase tracking-widest border-b border-outline-variant/10">
                    <tr>
                      <th className="pb-3 font-bold">Container</th>
                      <th className="pb-3 font-bold">Status</th>
                      <th className="pb-3 font-bold">Ports</th>
                      <th className="pb-3 font-bold">CPU</th>
                      <th className="pb-3 font-bold">Mem</th>
                      <th className="pb-3" />
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[13px]">
                    {containers.map((c) => {
                      const s = statsMap.get(c.id);
                      return (
                        <tr key={c.id} className="hover:bg-surface-container-highest/20 transition-colors">
                          <td className="py-3">{c.names}</td>
                          <td className="py-3">
                            <ContainerStatusBadge status={c.state ?? ''} />
                          </td>
                          <td className="py-3 text-on-surface-variant text-[11px]">
                            {c.ports ?? '—'}
                          </td>
                          <td className="py-3">
                            {s ? s.cpuPercent : '—'}
                          </td>
                          <td className="py-3">
                            {s ? s.memoryUsage.split(' / ')[0] : '—'}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              disabled={actionLoading === c.id}
                              onClick={() =>
                                handleContainerAction(
                                  c.id,
                                  c.state === 'running' ? 'stop' : 'start',
                                )
                              }
                              className="text-outline hover:text-on-surface disabled:opacity-40"
                            >
                              <span className="material-symbols-outlined text-lg">more_vert</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── System Logs (spans 2 cols) ───────────────────────────────── */}
          <div className="lg:col-span-2 p-6 rounded-xl bg-surface-container-lowest border-b border-surface-tint/10 flex flex-col min-h-70">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                System Logs
              </h3>
              <span className="material-symbols-outlined text-sm text-outline-variant">open_in_new</span>
            </div>
            <div className="flex-1 font-mono text-[11px] space-y-3 text-on-surface-variant overflow-y-auto pr-2">
              <p className="border-l-2 border-primary/40 pl-3">
                <span className="text-outline-variant">[--:--:--]</span>{' '}
                <span className="text-tertiary">INFO</span> Waiting for log stream...
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-outline-variant/10">
              <div className="flex bg-surface-container-low rounded p-1">
                <input
                  className="bg-transparent border-none focus:ring-0 text-xs flex-1 text-on-surface font-mono outline-none"
                  placeholder="Run command..."
                  type="text"
                />
                <button className="p-1 rounded bg-surface-container-high">
                  <span className="material-symbols-outlined text-xs">subdirectory_arrow_left</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Disk + System Info ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <DiskRing
            pct={snapshot.disk.pct}
            label={snapshot.disk.label}
            device={snapshot.disk.device}
          />
          <div className="md:col-span-2 bg-surface-container-low rounded-xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="font-bold mb-4">System Information</h3>
              <div className="grid grid-cols-2 gap-y-4 font-mono text-sm">
                {[
                  { key: 'OS Version', val: snapshot.os },
                  { key: 'Kernel', val: snapshot.kernel },
                  { key: 'Architecture', val: snapshot.arch },
                  { key: 'Uptime', val: snapshot.uptime },
                ].map(({ key, val }) => (
                  <div key={key}>
                    <p className="text-[10px] text-outline-variant uppercase tracking-widest font-bold">{key}</p>
                    <p className="text-on-surface">{val}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {snapshot.ssl && (
                  <div className="flex items-center gap-1 text-[12px] text-tertiary bg-tertiary/10 px-2 py-1 rounded">
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
                    SSL Valid
                  </div>
                )}
                {snapshot.firewall && (
                  <div className="flex items-center gap-1 text-[12px] text-primary bg-primary/10 px-2 py-1 rounded">
                    <span className="material-symbols-outlined text-[14px]">shield</span>
                    Firewall: Active
                  </div>
                )}
              </div>
              <button className="text-xs font-bold text-outline hover:text-on-surface transition-colors flex items-center gap-1">
                Detailed Specs
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
