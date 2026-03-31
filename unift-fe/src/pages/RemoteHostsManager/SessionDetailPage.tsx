import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './shared';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { SessionAnalyticsResponse, AnalyticsHistoryResponse } from '@/utils/remoteConnectionAPI';
import type { UIHost } from './types';

interface SessionDetailPageProps {
  host: UIHost;
  onBack: () => void;
  onDisconnect: (sessionId: string) => void;
  onOpenTerminal: () => void;
}

// Static session metadata derived from host — only used as fallback before analytics loads
function fallbackIp(host: UIHost): string {
  return host.userAtIp.split('@')[1] ?? host.userAtIp;
}

// Formats bytes-per-second to a human-readable rate string
function formatBytesPerSec(bps: number | null | undefined): string {
  if (bps == null || !isFinite(bps)) return '--';
  if (bps >= 1_073_741_824) return `${(bps / 1_073_741_824).toFixed(1)} GB/s`;
  if (bps >= 1_048_576)     return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  if (bps >= 1_024)         return `${(bps / 1_024).toFixed(0)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

// Formats an ISO heartbeat timestamp to a relative "Xm Ys ago" string
function formatHeartbeatAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const s = Math.floor(diffMs / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ${s % 60}s ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

function formatTrafficPointTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Traffic chart — renders download (violet) and upload (emerald) lines from live data
function TrafficChart({
  data,
  isLoading,
}: {
  data?: SessionAnalyticsResponse['trafficAnalysis'];
  isLoading?: boolean;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const points = data && data.length > 0 ? data : null;

  if (isLoading) {
    // Animated shimmer bars stood in for the real chart while data loads
    const barHeights = [35, 55, 42, 70, 48, 80, 58, 65, 45, 72, 38, 60];
    return (
      <div className="w-full h-full flex items-end gap-1 pb-1">
        {barHeights.map((h, i) => (
          <div key={i} className="flex-1 rounded-t shimmer" style={{ height: `${h}%` }} />
        ))}
      </div>
    );
  }

  if (!points) {
    // Empty state while loading
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-meta text-muted">No traffic data</span>
      </div>
    );
  }

  const n = points.length;
  const maxVal = Math.max(
    ...points.map(p => Math.max(p.downloadBytesPerSec, p.uploadBytesPerSec)),
    1, // prevent division by zero when all values are 0
  );

  // Map to SVG coords — x spread across 600, y clamped to [5, 95]
  const toSvg = (val: number, idx: number): [number, number] => [
    (idx / Math.max(n - 1, 1)) * 600,
    95 - (val / maxVal) * 90,
  ];

  const dlPoints = points.map((p, i) => toSvg(p.downloadBytesPerSec, i));
  const ulPoints = points.map((p, i) => toSvg(p.uploadBytesPerSec, i));
  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;
  const hoveredX = hoveredIndex !== null ? dlPoints[hoveredIndex][0] : null;
  const hoveredDlY = hoveredIndex !== null ? dlPoints[hoveredIndex][1] : null;
  const hoveredUlY = hoveredIndex !== null ? ulPoints[hoveredIndex][1] : null;

  const toPolyline = (pts: [number, number][]) =>
    pts.map(([x, y]) => `${x},${y}`).join(' ');
  const toArea = (pts: [number, number][]) =>
    `0,100 ${toPolyline(pts)} 600,100`;

  const getHitStart = (idx: number) =>
    idx === 0 ? 0 : (dlPoints[idx - 1][0] + dlPoints[idx][0]) / 2;
  const getHitWidth = (idx: number) => {
    const start = getHitStart(idx);
    const end = idx === dlPoints.length - 1 ? 600 : (dlPoints[idx][0] + dlPoints[idx + 1][0]) / 2;
    return end - start;
  };

  return (
    <div className="relative w-full h-full" onMouseLeave={() => setHoveredIndex(null)}>
      <svg viewBox="0 0 600 100" preserveAspectRatio="none" className="w-full h-full cursor-crosshair">
        <defs>
          <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C6DFA" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7C6DFA" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={toArea(dlPoints)} fill="url(#dlGrad)" />
        <polyline
          points={toPolyline(dlPoints)}
          fill="none" stroke="#7C6DFA" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        />
        <polygon points={toArea(ulPoints)} fill="url(#ulGrad)" />
        <polyline
          points={toPolyline(ulPoints)}
          fill="none" stroke="#4ade80" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
        />

        {hoveredX !== null && (
          <line x1={hoveredX} y1={0} x2={hoveredX} y2={100} stroke="rgba(238,238,248,0.14)" strokeDasharray="3 3" />
        )}

        {hoveredX !== null && hoveredDlY !== null && (
          <circle cx={hoveredX} cy={hoveredDlY} r="3.5" fill="#7C6DFA" stroke="#EEEEF8" strokeWidth="1.2" />
        )}
        {hoveredX !== null && hoveredUlY !== null && (
          <circle cx={hoveredX} cy={hoveredUlY} r="3.5" fill="#4ade80" stroke="#EEEEF8" strokeWidth="1.2" />
        )}

        {points.map((point, idx) => (
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
          style={{
            left: `${(hoveredX / 600) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <p className="text-micro text-secondary mb-1">{formatTrafficPointTime(hoveredPoint.timestamp)}</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-meta text-secondary">Download</span>
            <span className="text-code text-primary">{formatBytesPerSec(hoveredPoint.downloadBytesPerSec)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 mt-1">
            <span className="text-meta text-secondary">Upload</span>
            <span className="text-code text-primary">{formatBytesPerSec(hoveredPoint.uploadBytesPerSec)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// CPU usage bar for a connected node
function NodeRow({
  name,
  cpu,
  status,
  os,
}: {
  name: string;
  cpu: number | null;
  status: 'online' | 'timeout';
  os?: string;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span className="text-code">{name}</span>
        </div>
        {status === 'timeout' ? (
          <span className="text-micro text-amber-400">Timeout</span>
        ) : (
          <span className="text-meta text-muted">{cpu?.toFixed(1)}% CPU</span>
        )}
      </div>
      {os && <p className="text-micro text-muted mb-1">{os}</p>}
      {status === 'online' && cpu !== null && (
        <div className="h-0.5 rounded-full bg-[#13131E] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              cpu > 70 ? 'bg-amber-400' : 'bg-violet-500'
            }`}
            style={{ width: `${cpu}%` }}
          />
        </div>
      )}
      {status === 'timeout' && (
        <div className="h-0.5 rounded-full bg-amber-900/40" />
      )}
    </div>
  );
}

// Formats an ISO timestamp to a locale-friendly short string
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Single row in the Analytics History table — expandable to show packet loss + throughput breakdown
function HistoryRow({
  snapshot,
  isExpanded,
  onToggle,
}: {
  snapshot: SessionAnalyticsResponse;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const capturedAt = snapshot.metadata?.lastHeartbeat;
  const dlBps = snapshot.throughput?.currentDownloadBytesPerSec;
  const ulBps = snapshot.throughput?.currentUploadBytesPerSec;
  const avgLatency = snapshot.latency?.unavailable ? null : snapshot.latency?.avgMs;
  const lossPercent = snapshot.packetLoss?.unavailable ? null : snapshot.packetLoss?.lossPercent;

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-[#1E1E2E] hover:bg-[#0F0F1A]/60 transition-colors cursor-pointer select-none"
      >
        <td className="py-2.5 px-4 text-[11px] font-mono text-slate-400">
          {capturedAt ? formatTimestamp(capturedAt) : '--'}
        </td>
        <td className="py-2.5 px-4 text-[11px] font-mono text-slate-300">
          {snapshot.sessionDurationFormatted ?? '--'}
        </td>
        <td className="py-2.5 px-4 text-[11px] font-mono text-slate-300">
          {avgLatency != null ? `${avgLatency.toFixed(1)} ms` : '--'}
        </td>
        <td className="py-2.5 px-4 text-[11px] font-mono text-violet-400">
          {dlBps != null ? formatBytesPerSec(dlBps) : '--'}
        </td>
        <td className="py-2.5 px-4 text-[11px] font-mono text-emerald-400">
          {ulBps != null ? formatBytesPerSec(ulBps) : '--'}
        </td>
        <td className="py-2.5 px-4 text-[11px] font-mono">
          {lossPercent != null ? (
            <span className={lossPercent > 2 ? 'text-amber-400' : 'text-emerald-400'}>
              {lossPercent.toFixed(1)}%
            </span>
          ) : '--'}
        </td>
        <td className="py-2.5 px-4 text-slate-600">
          <span
            className={`material-symbols-rounded text-[14px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          >
            expand_more
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-[#080C18]">
          <td colSpan={7} className="px-6 py-3">
            <div className="grid grid-cols-3 gap-4">
              {/* SSH cipher & encryption */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-1.5">Connection</p>
                <p className="text-[11px] text-slate-400">
                  Cipher: <span className="font-mono text-slate-200">{snapshot.metadata?.sshCipher ?? '--'}</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Encryption: <span className="font-mono text-slate-200">{snapshot.metadata?.encryption ?? '--'}</span>
                </p>
              </div>
              {/* Latency range */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-1.5">Latency Range</p>
                <p className="text-[11px] text-slate-400">
                  Min: <span className="font-mono text-slate-200">
                    {snapshot.latency?.minMs != null ? `${snapshot.latency.minMs.toFixed(1)} ms` : '--'}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Max: <span className="font-mono text-slate-200">
                    {snapshot.latency?.maxMs != null ? `${snapshot.latency.maxMs.toFixed(1)} ms` : '--'}
                  </span>
                </p>
              </div>
              {/* System metrics */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-1.5">System Metrics</p>
                <p className="text-[11px] text-slate-400">
                  CPU: <span className="font-mono text-slate-200">
                    {snapshot.systemMetrics?.cpuPercent != null
                      ? `${snapshot.systemMetrics.cpuPercent.toFixed(1)}%`
                      : '--'}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Memory: <span className="font-mono text-slate-200">
                    {snapshot.systemMetrics?.memoryUsedPercent != null
                      ? `${snapshot.systemMetrics.memoryUsedPercent.toFixed(1)}%`
                      : '--'}
                  </span>
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Meta row inside session metadata panel
function MetaRow({ label, value, accent, isLoading }: { label: string; value: string; accent?: boolean; isLoading?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#1E1E2E] last:border-0">
      <span className="text-ui-sm text-secondary">{label}</span>
      {isLoading ? (
        <div className="h-4 w-28 rounded shimmer" />
      ) : (
        <span
          className={`text-code px-2 py-0.5 rounded ${
            accent
              ? 'text-emerald-400'
              : 'text-primary bg-[#1E1E2E]'
          }`}
        >
          {value}
        </span>
      )}
    </div>
  );
}

export function SessionDetailPage({
  host,
  onBack,
  onDisconnect,
  onOpenTerminal,
}: SessionDetailPageProps) {
  const [analytics, setAnalytics] = useState<SessionAnalyticsResponse | null>(null);
  const [analyticsError, setAnalyticsError] = useState(false);
  // True only on the very first load; subsequent polls keep stale data visible
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const hasFetchedOnce = useRef(false);

  // Tab state — 'live' for the polling view, 'history' for the historical snapshots view
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');

  // Analytics history state
  const [history, setHistory] = useState<AnalyticsHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [expandedSnapshotIdx, setExpandedSnapshotIdx] = useState<number | null>(null);
  const historyFetched = useRef(false);

  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await remoteConnectionAPI.getSessionAnalytics(host.sessionId);
      setAnalytics(data);
      setAnalyticsError(false);
    } catch {
      setAnalyticsError(true);
    } finally {
      if (!hasFetchedOnce.current) {
        hasFetchedOnce.current = true;
        setAnalyticsLoading(false);
      }
    }
  }, [host.sessionId]);

  // Fetch on mount, then poll every 30 seconds
  useEffect(() => {
    void fetchAnalytics();
    const interval = setInterval(() => void fetchAnalytics(), 30_000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  const fetchHistory = useCallback(async (loadMore = false) => {
    if (historyLoading) return;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const existingCount = loadMore ? (history?.snapshots.length ?? 0) : 0;
      const data = await remoteConnectionAPI.getSessionAnalyticsHistory(host.sessionId, {
        limit: existingCount + 50,
      });
      setHistory(data);
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, [host.sessionId, historyLoading, history?.snapshots.length]);

  // Fetch history when user switches to the history tab (once)
  useEffect(() => {
    if (activeTab === 'history' && !historyFetched.current) {
      historyFetched.current = true;
      void fetchHistory();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Derive connected nodes from analytics, falling back to empty
  const connectedNodes = analytics?.connectedNodes ?? [];

  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await onDisconnect(host.sessionId);
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#0C0C14] overflow-hidden">

      {/* Back nav */}
      <div className="flex items-center gap-3 px-8 py-4 border-b border-[#1E1E2E] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-muted hover:text-primary transition-colors cursor-pointer"
        >
          <Icon name="arrow_back" className="text-base" />
          <span className="text-micro text-secondary">Active Sessions</span>
        </button>
        <Icon name="chevron_right" className="text-sm text-slate-700" />
        <span className="text-meta text-secondary">{host.name.split(':')[0]}</span>
        <Icon name="chevron_right" className="text-sm text-slate-700" />
        <span className="text-meta text-primary">Analytics</span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-6">
        <div className="max-w-300 mx-auto flex flex-col gap-6">

          {/* Page title row */}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-display" style={{ fontSize: '22px' }}>
                {host.name.split(':')[0]}
              </h1>
              {host.status === 'online' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro bg-emerald-950/70 text-emerald-400 border border-emerald-800/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#4ade80]" />
                  ONLINE
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-meta text-secondary">
              <span className="flex items-center gap-1.5">
                <Icon name="dns" className="text-sm" />
                {analytics?.host ?? fallbackIp(host)}
              </span>
              {analytics?.metadata.remoteOs && (
                <span className="flex items-center gap-1.5">
                  <Icon name="computer" className="text-sm" />
                  {analytics.metadata.remoteOs}
                </span>
              )}
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-0.5 items-center bg-[#0F0F1A] border border-[#13131E] rounded-lg p-1 w-fit">
            {(['live', 'history'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-md text-micro transition-all cursor-pointer ${
                  activeTab === tab
                    ? 'brand-gradient text-on-brand shadow-sm'
                    : 'text-muted hover:text-secondary'
                }`}
              >
                {tab === 'live' ? 'Live Analytics' : 'History'}
              </button>
            ))}
          </div>

          {/* Analytics History tab content */}
          {activeTab === 'history' && (
            <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#13131E]">
                <div>
                  <p className="text-title">Analytics History</p>
                  {history != null && (
                    <p className="text-ui-sm text-muted mt-0.5">
                      {history.count} snapshot{history.count !== 1 ? 's' : ''} recorded
                    </p>
                  )}
                </div>
                <button
                  onClick={() => void fetchHistory()}
                  disabled={historyLoading}
                  className="flex items-center gap-1.5 text-meta text-muted hover:text-secondary transition-colors cursor-pointer disabled:opacity-40"
                >
                  <span className={`material-symbols-rounded text-[14px] ${historyLoading ? 'animate-spin' : ''}`}>
                    refresh
                  </span>
                  Refresh
                </button>
              </div>

              {historyError && (
                <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-800/30 bg-amber-950/20">
                  <span className="material-symbols-rounded text-sm text-amber-400 shrink-0">warning</span>
                  <p className="text-ui-sm text-amber-400">Failed to load analytics history.</p>
                </div>
              )}

              {historyLoading && history == null ? (
                <div className="p-5 flex flex-col gap-3">
                  {[0, 1, 2, 4].map(i => (
                    <div key={i} className="h-9 w-full rounded shimmer" />
                  ))}
                </div>
              ) : !history || history.snapshots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2">
                  <span className="material-symbols-rounded text-3xl text-slate-700">history</span>
                  <p className="text-ui-sm text-muted">No history snapshots available yet.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#13131E]">
                        {['Captured At', 'Duration', 'Avg Latency', 'Download', 'Upload', 'Packet Loss', ''].map(
                          col => (
                            <th
                              key={col}
                              className="text-left py-2.5 px-4 text-micro text-muted"
                            >
                              {col}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {history.snapshots.map((snapshot, idx) => (
                        <HistoryRow
                          key={idx}
                          snapshot={snapshot}
                          isExpanded={expandedSnapshotIdx === idx}
                          onToggle={() =>
                            setExpandedSnapshotIdx(prev => (prev === idx ? null : idx))
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                  {history.hasMore && (
                    <div className="flex justify-center py-4 border-t border-[#13131E]">
                      <button
                        onClick={() => void fetchHistory(true)}
                        disabled={historyLoading}
                        className="px-5 py-2 rounded-lg border border-[#252D45] text-ui-sm text-secondary hover:text-primary hover:border-slate-500 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {historyLoading ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Two-column layout */}
          {activeTab === 'live' && <div className="grid grid-cols-[1fr_300px] gap-6">

            {/* LEFT column */}
            <div className="flex flex-col gap-5">

              {/* Analytics error banner */}
              {analyticsError && !analyticsLoading && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-800/40 bg-amber-950/30">
                  <Icon name="warning" className="text-sm text-amber-400 shrink-0" />
                  <p className="text-ui-sm text-amber-400">
                    Could not fetch analytics — showing last known values. Will retry in 30s.
                  </p>
                </div>
              )}

              {/* Stat cards row */}
              <div className="grid grid-cols-4 gap-3">
                {/* Session Duration — from analytics */}
                <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
                  <p className="text-micro text-muted mb-3 flex items-center gap-1.5">
                    <Icon name="schedule" className="text-xs" />
                    Session Duration
                  </p>
                  {analyticsLoading ? (
                    <div className="h-6 w-20 rounded shimmer" />
                  ) : (
                    <p className="text-display text-code leading-none" style={{ fontSize: '22px' }}>
                      {analytics?.sessionDurationFormatted ?? '--'}
                    </p>
                  )}
                </div>

                {/* Throughput — live from analytics */}
                <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
                  <p className="text-micro text-muted mb-3 flex items-center gap-1.5">
                    <Icon name="swap_vert" className="text-xs" />
                    Throughput
                  </p>
                  <div className="flex items-end gap-2">
                    {analyticsLoading ? (
                      <div className="h-6 w-20 rounded shimmer" />
                    ) : analyticsError || !analytics ? (
                      <span className="text-code text-muted">--</span>
                    ) : (
                      <p className="text-display text-code leading-none" style={{ fontSize: '22px' }}>
                        {formatBytesPerSec(
                          (analytics.throughput.currentDownloadBytesPerSec ?? 0) +
                          (analytics.throughput.currentUploadBytesPerSec ?? 0)
                        )}
                      </p>
                    )}
                    <span className="mb-0.5">
                      <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
                        <rect x="0" y="8" width="4" height="8" fill="#7C6DFA" opacity="0.5" rx="1" />
                        <rect x="6" y="4" width="4" height="12" fill="#7C6DFA" opacity="0.7" rx="1" />
                        <rect x="12" y="0" width="4" height="16" fill="#7C6DFA" rx="1" />
                        <rect x="18" y="6" width="4" height="10" fill="#7C6DFA" opacity="0.6" rx="1" />
                      </svg>
                    </span>
                  </div>
                </div>

                {/* Latency — live from analytics */}
                <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
                  <p className="text-micro text-muted mb-3 flex items-center gap-1.5">
                    <Icon name="bolt" className="text-xs" />
                    Latency
                  </p>
                  <div className="flex items-end gap-2">
                    {analyticsLoading ? (
                      <div className="h-6 w-16 rounded shimmer" />
                    ) : analyticsError || !analytics ? (
                      <span className="text-code text-muted">--</span>
                    ) : (
                      <p className="text-display text-code leading-none" style={{ fontSize: '22px' }}>
                        {analytics.latency.unavailable ? '--' : analytics.latency.avgMs.toFixed(1)}
                        {!analytics.latency.unavailable && <span className="text-ui-sm text-muted"> ms</span>}
                      </p>
                    )}
                    {/* Waveform decoration */}
                    <svg width="40" height="16" viewBox="0 0 40 16" fill="none" className="mb-0.5">
                      <path d="M0 8 Q5 2 10 8 Q15 14 20 8 Q25 2 30 8 Q35 14 40 8" stroke="#7C6DFA" strokeWidth="1.5" fill="none" />
                    </svg>
                  </div>
                </div>

                {/* Packet Loss — live from analytics */}
                <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
                  <p className="text-micro text-muted mb-3 flex items-center gap-1.5">
                    <Icon name="wifi_tethering_error" className="text-xs" />
                    Packet Loss
                  </p>
                  {analyticsLoading ? (
                    <div className="h-6 w-16 rounded shimmer" />
                  ) : analyticsError || !analytics ? (
                    <span className="text-code text-muted">--</span>
                  ) : (
                    <p className="text-display text-emerald-400 leading-none text-code" style={{ fontSize: '22px' }}>
                      {analytics.packetLoss.unavailable ? '--' : `${(analytics.packetLoss.lossPercent ?? 0).toFixed(1)}%`}
                    </p>
                  )}
                </div>
              </div>

              {/* Bottom row: traffic chart + connected nodes */}
              <div className="grid grid-cols-[1fr_220px] gap-4">

                {/* Traffic Analysis */}
                <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-title">Traffic Analysis</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-violet-500" />
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-h-40">
                    <TrafficChart data={analytics?.trafficAnalysis} isLoading={analyticsLoading} />
                  </div>
                  <div className="flex items-center justify-center gap-4 mt-3">
                    <span className="flex items-center gap-1.5 text-micro text-muted">
                      <span className="w-2 h-0.5 bg-violet-500 rounded" /> Download
                    </span>
                    <span className="flex items-center gap-1.5 text-micro text-muted">
                      <span className="w-2 h-0.5 bg-emerald-400 rounded" /> Upload
                    </span>
                  </div>
                </div>

                {/* Connected Nodes */}
                <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-title">Connected Nodes</p>
                    <button className="text-micro text-violet-400 hover:text-violet-300 transition-colors cursor-pointer">
                      View Map
                    </button>
                  </div>
                  <div className="divide-y divide-[#1E1E2E]">
                    {analyticsLoading ? (
                      // Shimmer placeholder rows while analytics load
                      [0, 1, 2].map(i => (
                        <div key={i} className="py-2.5 flex flex-col gap-1.5">
                          <div className="h-3 w-3/4 rounded shimmer" />
                          <div className="h-1 w-full rounded shimmer" />
                        </div>
                      ))
                    ) : connectedNodes.length === 0 ? (
                      <p className="text-ui-sm text-muted py-3 text-center">No nodes</p>
                    ) : (
                      connectedNodes.map(node => (
                        <NodeRow
                          key={node.sessionId}
                          name={node.label || node.host}
                          cpu={node.cpuPercent}
                          status={node.state === 'ACTIVE' ? 'online' : 'timeout'}
                          os={node.remoteOs}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT column */}
            <div className="flex flex-col gap-4">

              {/* Terminal Access */}
              <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
                <button
                  onClick={onOpenTerminal}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1E1E2E] border border-[#252D45] text-ui-sm text-primary hover:border-slate-500 hover:text-white transition-colors cursor-pointer"
                >
                  <Icon name="terminal" className="text-sm" />
                  Terminal Access
                </button>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[#252D45] text-ui-sm text-secondary hover:border-slate-500 hover:text-primary transition-colors cursor-pointer">
                    <Icon name="refresh" className="text-sm" />
                    Reconnect
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-900/50 text-ui-sm text-red-400 hover:bg-red-950/30 hover:border-red-700/60 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Icon name="power_settings_new" className="text-sm" />
                    {disconnecting ? '...' : 'Disconnect'}
                  </button>
                </div>
              </div>

              {/* Session Metadata */}
              <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4 flex-1">
                <p className="text-micro text-muted mb-1">
                  Session Metadata
                </p>
                <div>
                  <MetaRow label="Process ID (PID)" isLoading={analyticsLoading} value={
                    analytics ? String(analytics.metadata.processPid) : '--'
                  } />
                  <MetaRow label="SSH Cipher" isLoading={analyticsLoading} value={
                    analytics?.metadata.sshCipher ?? '--'
                  } />
                  <MetaRow label="Port" isLoading={analyticsLoading} value={
                    analytics ? String(analytics.metadata.port) : String(host.port)
                  } />
                  <MetaRow label="Encryption" isLoading={analyticsLoading} value={
                    analytics?.metadata.encryption ?? '--'
                  } />
                  <MetaRow label="Tunnel Mode" isLoading={analyticsLoading} value={
                    analytics?.metadata.tunnelMode ?? '--'
                  } />
                  <MetaRow
                    label="Last Heartbeat"
                    isLoading={analyticsLoading}
                    value={
                      analytics?.metadata.lastHeartbeat
                        ? formatHeartbeatAge(analytics.metadata.lastHeartbeat)
                        : '--'
                    }
                    accent={!!analytics?.metadata.lastHeartbeat}
                  />
                </div>
              </div>

              {/* Region / Map placeholder */}
              <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl overflow-hidden relative" style={{ height: 120 }}>
                {/* Dark map texture via radial dots */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'radial-gradient(ellipse at 60% 50%, rgba(124,58,237,0.06) 0%, transparent 70%), #0A0F1E',
                    backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                  }}
                />
                {/* Pin */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Icon name="location_on" className="text-2xl text-slate-500" />
                </div>
                {/* Region label */}
                <div className="absolute bottom-2 left-3 flex items-center gap-1.5">
                  <Icon name="location_on" className="text-xs text-slate-600" />
                  <span className="text-meta text-muted">
                    {analytics?.metadata.region ?? 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}
