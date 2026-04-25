import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type {
  SessionAnalyticsResponse,
  TransferHistoryStatsResponse,
} from '@/utils/remoteConnectionAPI';
import type { UIHost } from './RemoteHostsManager/types';

interface DashboardPageProps {
  sessions: UIHost[];
  onNavigateToSessions: () => void;
  onNavigateToTransfers: () => void;
  onNewConnection?: () => void;
  onOpenWorkspace?: (sessionId: string) => void;
}

// Formats bytes-per-second to a compact rate string (GB/MB/KB)
function formatBps(bps: number): string {
  if (bps >= 1_073_741_824) return `${(bps / 1_073_741_824).toFixed(1)} GB/s`;
  if (bps >= 1_048_576)     return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  if (bps >= 1_024)         return `${(bps / 1_024).toFixed(0)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

// Formats bytes to a compact size string
function formatBytes(b: number): string {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1_024)         return `${(b / 1_024).toFixed(0)} KB`;
  return `${b} B`;
}

// Returns how long ago an ISO timestamp was as a short string
function timeAgo(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return 'recently';

  const s = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatChartTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Mini sparkline SVG rendered from TrafficDataPoint arrays
function Sparkline({
  data,
  color,
}: {
  data: { timestamp: string; downloadBytesPerSec: number; uploadBytesPerSec: number }[];
  color: 'violet' | 'emerald';
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  if (!data || data.length < 2) {
    return <div className="w-full h-full flex items-center justify-center">
      <span className="text-[9px] text-slate-700 font-mono">No data</span>
    </div>;
  }
  const vals = data.map(d => color === 'violet' ? d.downloadBytesPerSec : d.uploadBytesPerSec);
  const max = Math.max(...vals, 1);
  const n = vals.length;
  const svgPoints = vals.map((v, i): [number, number] => [
    (i / (n - 1)) * 100,
    30 - (v / max) * 28,
  ]);
  const points = svgPoints.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `0,30 ${points} 100,30`;
  const stroke = color === 'violet' ? '#7C6DFA' : '#4ade80';
  const fill   = color === 'violet' ? 'rgba(124,58,237,0.2)' : 'rgba(74,222,128,0.15)';
  const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : null;
  const hoveredX = hoveredIndex !== null ? svgPoints[hoveredIndex][0] : null;
  const hoveredY = hoveredIndex !== null ? svgPoints[hoveredIndex][1] : null;
  const getHitStart = (idx: number) => idx === 0 ? 0 : (svgPoints[idx - 1][0] + svgPoints[idx][0]) / 2;
  const getHitWidth = (idx: number) => {
    const start = getHitStart(idx);
    const end = idx === svgPoints.length - 1 ? 100 : (svgPoints[idx][0] + svgPoints[idx + 1][0]) / 2;
    return end - start;
  };

  return (
    <div className="relative w-full h-8" onMouseLeave={() => setHoveredIndex(null)}>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-8 cursor-crosshair">
        <polygon points={area} fill={fill} />
        <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
        {hoveredX !== null && hoveredY !== null && (
          <circle cx={hoveredX} cy={hoveredY} r="2.4" fill={stroke} stroke="#EEEEF8" strokeWidth="0.9" />
        )}
        {data.map((point, idx) => (
          <rect
            key={point.timestamp}
            x={getHitStart(idx)}
            y={0}
            width={getHitWidth(idx)}
            height={30}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(idx)}
          />
        ))}
      </svg>
      {hoveredPoint && hoveredX !== null && (
        <div
          className="pointer-events-none absolute -top-16 z-10 min-w-[132px] rounded-md border border-[#2B2B40] bg-[#10101A]/96 px-2.5 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.42)]"
          style={{ left: `${hoveredX}%`, transform: 'translateX(-50%)' }}
        >
          <p className="text-[9px] font-mono uppercase tracking-widest text-[#9090B0]">{formatChartTime(hoveredPoint.timestamp)}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-[10px] font-mono text-[#9090B0]">{color === 'violet' ? 'Download' : 'Upload'}</span>
            <span className="text-[10px] font-mono text-[#EEEEF8]">
              {formatBps(color === 'violet' ? hoveredPoint.downloadBytesPerSec : hoveredPoint.uploadBytesPerSec)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Full traffic area chart for the bottom panel
function TrafficAreaChart({ data }: { data: SessionAnalyticsResponse['trafficAnalysis'] | undefined }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  if (!data || data.length < 2) {
    return <div className="w-full h-full flex items-center justify-center">
      <span className="text-xs text-slate-700 font-mono">No traffic data</span>
    </div>;
  }
  const n = data.length;
  const maxVal = Math.max(...data.map(d => Math.max(d.downloadBytesPerSec, d.uploadBytesPerSec)), 1);
  const toSvg = (v: number, i: number): [number, number] => [
    (i / Math.max(n - 1, 1)) * 600,
    95 - (v / maxVal) * 88,
  ];
  const dlPts = data.map((d, i) => toSvg(d.downloadBytesPerSec, i));
  const ulPts = data.map((d, i) => toSvg(d.uploadBytesPerSec, i));
  const poly  = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(' ');
  const area  = (pts: [number, number][]) => `0,100 ${poly(pts)} 600,100`;
  const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : null;
  const hoveredX = hoveredIndex !== null ? dlPts[hoveredIndex][0] : null;
  const hoveredDlY = hoveredIndex !== null ? dlPts[hoveredIndex][1] : null;
  const hoveredUlY = hoveredIndex !== null ? ulPts[hoveredIndex][1] : null;
  const getHitStart = (idx: number) => idx === 0 ? 0 : (dlPts[idx - 1][0] + dlPts[idx][0]) / 2;
  const getHitWidth = (idx: number) => {
    const start = getHitStart(idx);
    const end = idx === dlPts.length - 1 ? 600 : (dlPts[idx][0] + dlPts[idx + 1][0]) / 2;
    return end - start;
  };

  return (
    <div className="relative w-full h-full" onMouseLeave={() => setHoveredIndex(null)}>
      <svg viewBox="0 0 600 100" preserveAspectRatio="none" className="w-full h-full cursor-crosshair">
        <defs>
          <linearGradient id="dlG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C6DFA" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#7C6DFA" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ulG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area(dlPts)} fill="url(#dlG)" />
        <polyline points={poly(dlPts)} fill="none" stroke="#7C6DFA" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
        <polygon points={area(ulPts)} fill="url(#ulG)" />
        <polyline points={poly(ulPts)} fill="none" stroke="#4ade80" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {hoveredX !== null && (
          <line x1={hoveredX} y1={0} x2={hoveredX} y2={100} stroke="rgba(238,238,248,0.14)" strokeDasharray="3 3" />
        )}
        {hoveredX !== null && hoveredDlY !== null && (
          <circle cx={hoveredX} cy={hoveredDlY} r="3.5" fill="#7C6DFA" stroke="#EEEEF8" strokeWidth="1.2" />
        )}
        {hoveredX !== null && hoveredUlY !== null && (
          <circle cx={hoveredX} cy={hoveredUlY} r="3.5" fill="#4ade80" stroke="#EEEEF8" strokeWidth="1.2" />
        )}

        {data.map((point, idx) => (
          <rect
            key={point.timestamp}
            x={getHitStart(idx)}
            y={0}
            width={getHitWidth(idx)}
            height={100}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(idx)}
          />
        ))}
      </svg>

      {hoveredPoint && hoveredX !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[148px] rounded-lg border border-[#2B2B40] bg-[#10101A]/96 px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
          style={{ left: `${(hoveredX / 600) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <p className="text-[9px] font-mono uppercase tracking-widest text-[#9090B0]">{formatChartTime(hoveredPoint.timestamp)}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-[10px] font-mono text-[#9090B0]">Download</span>
            <span className="text-[10px] font-mono text-[#EEEEF8]">{formatBps(hoveredPoint.downloadBytesPerSec)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-[10px] font-mono text-[#9090B0]">Upload</span>
            <span className="text-[10px] font-mono text-[#EEEEF8]">{formatBps(hoveredPoint.uploadBytesPerSec)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Top stat card
function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  loading,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  accent?: 'amber' | 'violet' | 'blue' | 'emerald';
  loading?: boolean;
}) {
  const borderColor = accent === 'amber' ? '#E07B39' : 'transparent';
  const iconColor   = accent === 'amber' ? '#E07B39'
    : accent === 'violet' ? '#7C6DFA'
    : accent === 'blue'   ? '#7C6DFA'
    : '#4ade80';

  return (
    <div
      className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-5 flex flex-col gap-3 relative overflow-hidden"
      style={{ borderRight: accent === 'amber' ? `3px solid ${borderColor}` : undefined }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">{label}</p>
        <span className="material-symbols-rounded" style={{ fontSize: '16px', color: iconColor }}>
          {icon}
        </span>
      </div>
      {loading ? (
        <div className="h-8 w-28 rounded shimmer" />
      ) : (
        <div className="flex items-end gap-2">
          <p className={`text-[26px] font-bold leading-none font-mono ${accent === 'amber' ? 'text-[#E07B39]' : 'text-slate-100'}`}>
            {value}
          </p>
          {sub && (
            <span className="text-[11px] text-slate-500 mb-0.5 font-mono">{sub}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Region badge shown on session cards
function RegionBadge({ region }: { region: string }) {
  return (
    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1E1E2E] text-slate-500 border border-[#252D45]">
      {region}
    </span>
  );
}

// Session card in the Active Connections grid
function SessionCard({
  host,
  analytics,
  loading,
  onOpenWorkspace,
  onViewDetails,
}: {
  host: UIHost;
  analytics: SessionAnalyticsResponse | null;
  loading: boolean;
  onOpenWorkspace?: () => void;
  onViewDetails?: () => void;
}) {
  const statusColor = host.status === 'online' ? '#4ade80' : host.status === 'warning' ? '#E07B39' : '#5a6380';
  const statusLabel = host.status === 'online' ? 'ONLINE' : host.status === 'warning' ? 'ISSUE' : 'IDLE';
  const ip = host.userAtIp.split('@')[1] ?? host.userAtIp;
  const region = analytics?.metadata?.region ?? 'unknown';

  return (
    <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4 pb-14 flex flex-col gap-3 hover:border-[#1E1E2E] transition-colors relative">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-200 truncate">{host.name.split(':')[0]}</p>
          <p className="text-[10px] font-mono text-slate-600 mt-0.5">{ip} &middot; {host.protocol?.toUpperCase() ?? 'SSH'}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor }} />
            <span className="text-[9px] font-bold font-mono" style={{ color: statusColor }}>{statusLabel}</span>
          </div>
          <RegionBadge region={region} />
        </div>
      </div>

      {loading ? (
        <div className="h-8 w-full rounded shimmer" />
      ) : (
        <div className="h-8 relative">
          <Sparkline data={analytics?.trafficAnalysis ?? []} color="violet" />
          <div className="absolute inset-0">
            <Sparkline data={analytics?.trafficAnalysis ?? []} color="emerald" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] text-slate-700 uppercase tracking-wider mb-0.5">Download</p>
          <p className="text-[11px] font-mono text-violet-400">
            {analytics?.throughput?.currentDownloadBytesPerSec != null
              ? formatBps(analytics.throughput.currentDownloadBytesPerSec)
              : '--'}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-slate-700 uppercase tracking-wider mb-0.5">Upload</p>
          <p className="text-[11px] font-mono text-emerald-400">
            {analytics?.throughput?.currentUploadBytesPerSec != null
              ? formatBps(analytics.throughput.currentUploadBytesPerSec)
              : '--'}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-slate-700 uppercase tracking-wider mb-0.5">Latency</p>
          <p className="text-[11px] font-mono text-slate-300">
            {analytics?.latency?.unavailable ? '--' : `${analytics?.latency?.avgMs?.toFixed(0) ?? '--'}ms`}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-slate-700 uppercase tracking-wider mb-0.5">CPU</p>
          <p className="text-[11px] font-mono text-slate-300">
            {analytics?.systemMetrics?.cpuPercent != null
              ? `${analytics.systemMetrics.cpuPercent.toFixed(0)}%`
              : '--'}
          </p>
        </div>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
        <button
          onClick={onViewDetails}
          className="px-2.5 py-1 rounded text-[10px] font-semibold bg-[#1E1E2E] text-slate-400 border border-[#252D45] hover:text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
        >
          Details
        </button>
        <button
          onClick={onOpenWorkspace}
          className="px-2.5 py-1 rounded text-[10px] font-semibold text-white transition-colors cursor-pointer"
          style={{ background: 'var(--color-primary)' }}
        >
          Open Workspace
        </button>
      </div>
    </div>
  );
}

// Horizontal dual bar for Node Allocation panel
function AllocationBar({
  label,
  cpu,
  ram,
}: {
  label: string;
  cpu: number;
  ram: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400 font-mono truncate max-w-40">{label}</span>
        <span className="text-[10px] text-slate-600 font-mono shrink-0 ml-2">
          {cpu.toFixed(0)}% CPU | {ram.toFixed(0)}% RAM
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="h-1.5 bg-[#1E1E2E] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${cpu}%`, background: cpu > 80 ? '#E07B39' : '#7C6DFA' }}
          />
        </div>
        <div className="h-1.5 bg-[#1E1E2E] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${ram}%`, background: ram > 85 ? '#f87171' : '#4ade80' }}
          />
        </div>
      </div>
    </div>
  );
}

// Recent activity item
interface ActivityItem {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  sub: string;
  time: string;
  tag?: string;
  tagColor?: string;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-[#1E1E2E] last:border-0">
      <span
        className="w-2 h-2 rounded-full shrink-0 mt-1"
        style={{ background: item.iconColor }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-slate-200 font-semibold leading-snug">{item.title}</p>
        <p className="text-[10px] text-slate-600 font-mono mt-0.5">{item.sub} • {item.time}</p>
        {item.tag && (
          <span
            className="inline-block mt-1.5 text-[9px] font-mono px-2 py-0.5 rounded border"
            style={{ color: item.tagColor, borderColor: `${item.tagColor}40`, background: `${item.tagColor}10` }}
          >
            {item.tag}
          </span>
        )}
      </div>
    </div>
  );
}

// Derive synthetic activity feed from live session analytics data
function buildActivityFeed(
  sessions: UIHost[],
  analyticsMap: Map<string, SessionAnalyticsResponse>,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const host of sessions) {
    const a = analyticsMap.get(host.sessionId);
    const name = host.name.split(':')[0];
    const connectedAt = a?.metadata?.lastHeartbeat ?? host.lastConnected;

    if (host.status === 'online') {
      const cpuPercent = a?.systemMetrics?.cpuPercent;
      if (cpuPercent != null && cpuPercent > 85) {
        items.push({
          id: `cpu-${host.sessionId}`,
          icon: 'warning',
          iconColor: '#E07B39',
          title: `CPU usage exceeded 85% threshold`,
          sub: name,
          time: connectedAt ? timeAgo(connectedAt) : 'recently',
          tag: 'High CPU',
          tagColor: '#E07B39',
        });
      } else {
        items.push({
          id: `online-${host.sessionId}`,
          icon: 'check_circle',
          iconColor: '#4ade80',
          title: 'Session active',
          sub: name,
          time: connectedAt ? timeAgo(connectedAt) : 'recently',
        });
      }
    } else if (host.status === 'warning') {
      items.push({
        id: `warn-${host.sessionId}`,
        icon: 'warning',
        iconColor: '#E07B39',
        title: 'Session degraded',
        sub: name,
        time: host.lastConnected ? timeAgo(host.lastConnected) : 'recently',
        tag: 'Warning',
        tagColor: '#E07B39',
      });
    } else {
      items.push({
        id: `offline-${host.sessionId}`,
        icon: 'circle',
        iconColor: '#5a6380',
        title: 'Session disconnected',
        sub: name,
        time: host.lastConnected ? timeAgo(host.lastConnected) : 'unknown',
      });
    }
  }

  // Stable sort: warnings first, then online, then offline
  const order = (i: ActivityItem) =>
    i.iconColor === '#E07B39' ? 0 : i.iconColor === '#4ade80' ? 1 : 2;
  return items.sort((a, b) => order(a) - order(b)).slice(0, 8);
}

export function DashboardPage({ sessions, onNavigateToSessions, onNavigateToTransfers, onNewConnection, onOpenWorkspace }: DashboardPageProps) {
  const [analyticsMap, setAnalyticsMap]     = useState<Map<string, SessionAnalyticsResponse>>(new Map());
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [transferStats, setTransferStats]   = useState<TransferHistoryStatsResponse | null>(null);
  const [liveUpdates, setLiveUpdates]       = useState(true);
  const hasFetched = useRef(false);
  const analyticsStopFns = useRef<Map<string, () => void>>(new Map());

  const fetchTransferStats = useEffectEvent(async () => {
    try {
      const stats = await remoteConnectionAPI.getTransferHistoryStats();
      setTransferStats(stats);
    } catch {
      // Non-critical widget; ignore fetch failures.
    }
  });

  // Fetch analytics for all active sessions in parallel
  const fetchAllAnalytics = useEffectEvent(async () => {
    const online = sessions.filter(s => s.status === 'online');
    if (online.length === 0) {
      if (!hasFetched.current) {
        hasFetched.current = true;
        setAnalyticsLoading(false);
      }
      return;
    }
    const results = await Promise.allSettled(
      online.map(s => remoteConnectionAPI.getSessionAnalytics(s.sessionId))
    );
    setAnalyticsMap(prev => {
      const next = new Map(prev);
      online.forEach((s, i) => {
        const r = results[i];
        if (r.status === 'fulfilled') next.set(s.sessionId, r.value);
      });
      return next;
    });
    if (!hasFetched.current) {
      hasFetched.current = true;
      setAnalyticsLoading(false);
    }
  });

  useEffect(() => {
    void fetchAllAnalytics();
  }, [sessions]);

  // Live stream analytics while updates are enabled.
  useEffect(() => {
    const stopFns = analyticsStopFns.current;
    for (const stop of stopFns.values()) stop();
    stopFns.clear();

    if (!liveUpdates) return;

    const online = sessions.filter((s) => s.status === 'online');
    if (online.length === 0) return;

    for (const s of online) {
      void remoteConnectionAPI
        .streamSessionAnalytics(
          s.sessionId,
          5000,
          (analytics) => {
            setAnalyticsMap((prev) => {
              const next = new Map(prev);
              next.set(s.sessionId, analytics);
              return next;
            });
            if (!hasFetched.current) {
              hasFetched.current = true;
              setAnalyticsLoading(false);
            }
          },
          () => {
            if (!hasFetched.current) {
              hasFetched.current = true;
              setAnalyticsLoading(false);
            }
          },
        )
        .then((stop) => {
          stopFns.set(s.sessionId, stop);
        });
    }

    return () => {
      for (const stop of stopFns.values()) stop();
      stopFns.clear();
    };
  }, [liveUpdates, sessions]);

  // Stream transfer history aggregate stats while live updates are enabled.
  useEffect(() => {
    if (!liveUpdates) return;
    let stop: (() => void) | null = null;
    void remoteConnectionAPI
      .streamTransferHistoryStats(
        15000,
        (stats) => setTransferStats(stats),
        () => {
          void fetchTransferStats();
        },
      )
      .then((s) => {
        stop = s;
      });

    return () => {
      stop?.();
    };
  }, [liveUpdates]);

  // Derived aggregate metrics
  const onlineSessions  = sessions.filter(s => s.status === 'online');
  const warningSessions = sessions.filter(s => s.status === 'warning');
  const totalNodes      = sessions.length;
  const activePercent   = totalNodes > 0
    ? ((onlineSessions.length / totalNodes) * 100).toFixed(1)
    : '0';

  const totalDownBps = onlineSessions.reduce((acc, s) => {
    const a = analyticsMap.get(s.sessionId);
    return acc + (a?.throughput?.currentDownloadBytesPerSec ?? 0);
  }, 0);
  const totalUpBps = onlineSessions.reduce((acc, s) => {
    const a = analyticsMap.get(s.sessionId);
    return acc + (a?.throughput?.currentUploadBytesPerSec ?? 0);
  }, 0);
  const totalBandwidth = totalDownBps + totalUpBps;

  const avgCpu = (() => {
    const vals = onlineSessions
      .map(s => analyticsMap.get(s.sessionId)?.systemMetrics?.cpuPercent)
      .filter((v): v is number => v != null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  const criticalAlerts = warningSessions.length +
    onlineSessions.filter(s => {
      const a = analyticsMap.get(s.sessionId);
      return (a?.systemMetrics?.cpuPercent ?? 0) > 85;
    }).length;

  // Pick the session with the most traffic for the Traffic Analysis chart
  const busiestSession = onlineSessions.reduce<UIHost | null>((best, s) => {
    const a = analyticsMap.get(s.sessionId);
    const bps = (a?.throughput?.currentDownloadBytesPerSec ?? 0) + (a?.throughput?.currentUploadBytesPerSec ?? 0);
    if (!best) return s;
    const bestA = analyticsMap.get(best.sessionId);
    const bestBps = (bestA?.throughput?.currentDownloadBytesPerSec ?? 0) + (bestA?.throughput?.currentUploadBytesPerSec ?? 0);
    return bps > bestBps ? s : best;
  }, null);
  const chartData = busiestSession
    ? analyticsMap.get(busiestSession.sessionId)?.trafficAnalysis
    : undefined;

  // Node allocation: top 5 by CPU
  const allocationRows = onlineSessions
    .map(s => {
      const a = analyticsMap.get(s.sessionId);
      return {
        label: s.name.split(':')[0],
        cpu: a?.systemMetrics?.cpuPercent ?? 0,
        ram: a?.systemMetrics?.memoryUsedPercent ?? 0,
      };
    })
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, 5);

  const activityFeed = buildActivityFeed(sessions, analyticsMap);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-6 bg-[#0C0C14]">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-6">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-slate-100">Dashboard</h1>
            <p className="text-[12px] text-slate-600 mt-0.5 font-mono">
              {liveUpdates ? 'Auto-refreshing every 30s' : 'Live updates paused'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onNavigateToTransfers}
              className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-[#1E1E2E] text-slate-400 border border-[#252D45] hover:text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
            >
              Export Report
            </button>
            <button
              onClick={onNewConnection}
              className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-colors cursor-pointer"
              style={{ background: 'var(--color-primary)' }}
            >
              New Connection
            </button>
          </div>
        </div>

        {/* Stat cards row */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            icon="hub"
            label="Total Nodes"
            value={String(totalNodes)}
            sub={`${activePercent}% Active`}
            accent="blue"
            loading={false}
          />
          <StatCard
            icon="speed"
            label="Total Bandwidth"
            value={totalBandwidth > 0 ? formatBps(totalBandwidth) : '0 B/s'}
            sub="combined"
            accent="violet"
            loading={analyticsLoading && onlineSessions.length > 0}
          />
          <StatCard
            icon="memory"
            label="Avg CPU Load"
            value={avgCpu != null ? `${avgCpu.toFixed(0)}%` : '--'}
            sub="Across cluster"
            accent="emerald"
            loading={analyticsLoading && onlineSessions.length > 0}
          />
          <StatCard
            icon="warning"
            label="Critical Alerts"
            value={String(criticalAlerts).padStart(2, '0')}
            sub={criticalAlerts > 0 ? 'Requires action' : 'All clear'}
            accent="amber"
            loading={false}
          />
        </div>

        {/* Active Connections + Recent Activity */}
        <div className="grid grid-cols-[1fr_320px] gap-5">

          {/* Active Connections */}
          <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#13131E]">
              <p className="text-sm font-semibold text-slate-200">Active Sessions</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setLiveUpdates(v => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    liveUpdates
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                      : 'bg-[#1E1E2E] text-slate-600 border border-[#252D45]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${liveUpdates ? 'bg-emerald-400 animate-pulse' : 'bg-slate-700'}`} />
                  Live
                </button>
                <button
                  onClick={onNavigateToSessions}
                  className="text-[11px] font-semibold cursor-pointer hover:text-slate-200 transition-colors"
                  style={{ color: 'var(--color-primary)' }}
                >
                  View all sessions &rarr;
                </button>
              </div>
            </div>

            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <span className="material-symbols-rounded text-4xl text-slate-800">hub</span>
                <p className="text-[12px] text-slate-600">No active sessions</p>
                <button
                  onClick={onNewConnection ?? onNavigateToSessions}
                  className="mt-1 px-4 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-colors cursor-pointer"
                  style={{ background: 'var(--color-primary)' }}
                >
                  New Connection
                </button>
              </div>
            ) : (
              <div className="p-4 grid grid-cols-2 gap-4">
                {sessions.map(host => (
                  <SessionCard
                    key={host.sessionId}
                    host={host}
                    analytics={analyticsMap.get(host.sessionId) ?? null}
                    loading={analyticsLoading && !analyticsMap.has(host.sessionId)}
                    onOpenWorkspace={() => onOpenWorkspace?.(host.sessionId)}
                    onViewDetails={() => onNavigateToSessions()}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#13131E] shrink-0">
              <p className="text-sm font-semibold text-slate-200">Recent Activity</p>
              <button
                onClick={onNavigateToTransfers}
                className="text-[10px] font-bold uppercase tracking-wider text-[#7C6DFA] hover:text-blue-300 transition-colors cursor-pointer"
              >
                View All
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-5">
              {activityFeed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <span className="material-symbols-rounded text-3xl text-slate-800">history</span>
                  <p className="text-[11px] text-slate-600">No activity yet</p>
                </div>
              ) : (
                activityFeed.map(item => (
                  <ActivityRow key={item.id} item={item} />
                ))
              )}
            </div>

            {/* Transfer stats footer */}
            {transferStats && (
              <div className="px-5 py-3 border-t border-[#1E1E2E] shrink-0 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[9px] text-slate-700 uppercase tracking-wider">Total Transfers</p>
                  <p className="text-[13px] font-bold font-mono text-slate-300 mt-0.5">
                    {transferStats.totalTransfers.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-700 uppercase tracking-wider">Data Moved</p>
                  <p className="text-[13px] font-bold font-mono text-slate-300 mt-0.5">
                    {transferStats.totalBytesTransferred != null
                      ? formatBytes(transferStats.totalBytesTransferred)
                      : '--'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Traffic Analysis + Node Allocation */}
        <div className="grid grid-cols-[1fr_380px] gap-5">

          {/* Traffic Analysis */}
          <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-5 flex flex-col">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-sm font-semibold text-slate-200">Traffic Analysis</p>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {busiestSession
                    ? `Throughput for ${busiestSession.name.split(':')[0]}`
                    : 'Throughput (GB/s) over last 24 hours'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-slate-600 font-mono">
                  <span className="w-2.5 h-0.5 bg-violet-500 rounded inline-block" /> Download
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-slate-600 font-mono">
                  <span className="w-2.5 h-0.5 bg-emerald-400 rounded inline-block" /> Upload
                </span>
              </div>
            </div>
            <div className="flex-1 min-h-40 mt-3">
              {analyticsLoading && !chartData ? (
                <div className="w-full h-40 rounded shimmer" />
              ) : (
                <TrafficAreaChart data={chartData} />
              )}
            </div>
          </div>

          {/* Node Allocation */}
          <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-slate-200">Node Allocation</p>
                <p className="text-[10px] text-slate-600 mt-0.5">Top 5 Resource Consumers</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-slate-600 font-mono">
                  <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> CPU
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-slate-600 font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> RAM
                </span>
              </div>
            </div>

            {analyticsLoading && allocationRows.length === 0 ? (
              <div className="flex flex-col gap-4">
                {[0, 1, 2].map(i => <div key={i} className="h-10 rounded shimmer" />)}
              </div>
            ) : allocationRows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-rounded text-3xl text-slate-800">bar_chart</span>
                <p className="text-[11px] text-slate-600">No resource data available</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {allocationRows.map(row => (
                  <AllocationBar key={row.label} label={row.label} cpu={row.cpu} ram={row.ram} />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
