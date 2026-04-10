import { useState, useEffect, useCallback } from 'react';
import { useTransferStore } from '@/store/transferStore';
import { remoteConnectionAPI, type TransferStatusResponse, type TransferState, type TransferHistoryStatsResponse } from '@/utils/remoteConnectionAPI';

interface TransferHistoryPageProps {
  sessionIds: string[];
}

type FilterState = 'ALL' | TransferState;
type FilterDirection = 'ALL' | 'UPLOAD' | 'DOWNLOAD';

// Returns the short filename from a remote path
function fileName(remotePath: string): string {
  return remotePath.split('/').filter(Boolean).pop() ?? remotePath;
}

// Formats bytes as a human-readable string
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const STATE_BADGE: Record<TransferState, { label: string; classes: string }> = {
  PENDING:     { label: 'Pending',     classes: 'bg-slate-800 text-slate-400 border border-slate-700' },
  IN_PROGRESS: { label: 'Transferring',classes: 'bg-blue-900/40 text-[#7C6DFA] border border-blue-700/40' },
  COMPLETED:   { label: 'Done',        classes: 'bg-green-900/40 text-[#4ade80] border border-green-700/40' },
  FAILED:      { label: 'Failed',      classes: 'bg-red-900/40 text-red-400 border border-red-700/40' },
  CANCELLED:   { label: 'Cancelled',   classes: 'bg-slate-800/60 text-slate-500 border border-[#1E1E2E]' },
};

function StateBadge({ state }: { state: TransferState }) {
  const { label, classes } = STATE_BADGE[state];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${classes}`}>
      {label}
    </span>
  );
}

export function TransferHistoryPage({ sessionIds }: TransferHistoryPageProps) {
  const { transfersBySession, setTransfers } = useTransferStore();
  const [loading, setLoading] = useState(sessionIds.length > 0);
  const [filterState, setFilterState] = useState<FilterState>('ALL');
  const [filterDirection, setFilterDirection] = useState<FilterDirection>('ALL');
  const [transferStats, setTransferStats] = useState<TransferHistoryStatsResponse | null>(null);

  // Fetch all transfers for all known sessions
  const refreshAll = useCallback(async () => {
    if (sessionIds.length === 0) return;
    await Promise.all(
      sessionIds.map(id =>
        remoteConnectionAPI
          .getTransfers(id)
          .then(list => setTransfers(id, list))
          .catch(() => { /* non-critical */ })
      )
    );
    setLoading(false);
  }, [sessionIds, setTransfers]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    let stop: (() => void) | null = null;
    void remoteConnectionAPI
      .getTransferHistoryStats()
      .then((s) => setTransferStats(s))
      .catch(() => {});
    void remoteConnectionAPI
      .streamTransferHistoryStats(
        30_000,
        (s) => setTransferStats(s),
        () => {},
      )
      .then((s) => { stop = s; });
    return () => { stop?.(); };
  }, []);

  // Flatten + sort newest first
  const allTransfers: (TransferStatusResponse & { sessionId: string })[] =
    Object.entries(transfersBySession)
      .flatMap(([sessionId, list]) =>
        list.map(t => ({ ...t, sessionId }))
      )
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const filtered = allTransfers.filter(t => {
    if (filterState !== 'ALL' && t.state !== filterState) return false;
    if (filterDirection !== 'ALL' && t.direction !== filterDirection) return false;
    return true;
  });

  const activeCount = allTransfers.filter(
    t => t.state === 'PENDING' || t.state === 'IN_PROGRESS',
  ).length;

  return (
    <div className="h-full flex flex-col overflow-hidden p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Transfer History</h2>
          <p className="text-xs font-mono text-slate-500 mt-0.5">
            All uploads and downloads across active sessions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900/30 border border-blue-700/40 rounded text-xs font-mono text-[#7C6DFA]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7C6DFA] animate-pulse" />
              {activeCount} active
            </span>
          )}
          <button
            onClick={() => { setLoading(true); void refreshAll(); }}
            disabled={loading}
            title="Refresh all transfers"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#13131E] border border-[#1E1E2E] rounded text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-[#171724] transition-colors cursor-pointer disabled:opacity-50"
          >
            <span
              className={`material-symbols-rounded text-sm ${loading ? 'animate-spin' : ''}`}
            >
              refresh
            </span>
            Refresh
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {transferStats && (
        <div className="grid grid-cols-2 gap-3 mb-5 shrink-0 sm:grid-cols-3 lg:grid-cols-5">
          <StatsCard label="Total" value={String(transferStats.totalTransfers)} icon="swap_vert" />
          <StatsCard label="Completed" value={String(transferStats.completedTransfers)} icon="check_circle" accent="#4ade80" />
          <StatsCard label="Failed" value={String(transferStats.failedTransfers)} icon="cancel" accent="#f87171" />
          <StatsCard
            label="Transferred"
            value={transferStats.totalBytesTransferred != null ? formatBytes(transferStats.totalBytesTransferred) : '—'}
            icon="storage"
            accent="#7C6DFA"
          />
          <StatsCard
            label="Avg Speed"
            value={transferStats.avgSpeedBps != null ? formatBytes(transferStats.avgSpeedBps) + '/s' : '—'}
            icon="speed"
          />
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 shrink-0 flex-wrap">
        <span className="text-xs font-mono text-slate-500">Filter:</span>

        {/* State filter */}
        <div className="flex items-center bg-[#13131E] border border-[#1E1E2E] rounded overflow-hidden">
          {(['ALL', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED'] as FilterState[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterState(s)}
              className={`px-2.5 py-1 text-[10px] font-mono cursor-pointer transition-colors ${
                filterState === s
                  ? 'bg-[#7C6DFA] text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {s === 'IN_PROGRESS' ? 'Active' : s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Direction filter */}
        <div className="flex items-center bg-[#13131E] border border-[#1E1E2E] rounded overflow-hidden">
          {(['ALL', 'UPLOAD', 'DOWNLOAD'] as FilterDirection[]).map(d => (
            <button
              key={d}
              onClick={() => setFilterDirection(d)}
              className={`px-2.5 py-1 text-[10px] font-mono cursor-pointer transition-colors ${
                filterDirection === d
                  ? 'bg-[#7C6DFA] text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {d === 'ALL' ? 'All' : d.charAt(0) + d.slice(1).toLowerCase()}s
            </button>
          ))}
        </div>

        <span className="text-[10px] font-mono text-slate-600 ml-auto">
          {filtered.length} {filtered.length === 1 ? 'transfer' : 'transfers'}
        </span>
      </div>

      {/* Transfer table */}
      {sessionIds.length === 0 ? (
        <EmptyState message="No active sessions. Connect to a remote host to start transferring files." />
      ) : loading && allTransfers.length === 0 ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
          <span className="material-symbols-rounded text-lg animate-spin">hourglass_bottom</span>
          <span className="text-xs font-mono">Loading transfers...</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message="No transfers match the current filter." />
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar rounded-lg border border-[#1E1E2E]">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-2 bg-[#13131E] border-b border-[#1E1E2E] shrink-0 sticky top-0 z-10">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider w-5" />
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">File</span>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider w-32 text-right">Size</span>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider w-32 text-right">Progress</span>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider w-24 text-right">Status</span>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider w-20 text-right">Time</span>
          </div>

          {filtered.map(t => (
            <TransferHistoryRow key={`${t.sessionId}-${t.transferId}`} transfer={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 opacity-40">
      <span className="material-symbols-rounded text-4xl text-slate-500">swap_vert</span>
      <p className="text-xs font-mono text-slate-500 text-center max-w-xs">{message}</p>
    </div>
  );
}

// ── Transfer history row ───────────────────────────────────────────────────
interface TransferHistoryRowProps {
  transfer: TransferStatusResponse;
}

function TransferHistoryRow({ transfer: t }: TransferHistoryRowProps) {
  const pct = Math.min(100, Math.max(0, t.progressPercent ?? 0));
  const isActive = t.state === 'PENDING' || t.state === 'IN_PROGRESS';

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-2.5 border-b border-[#1E1E2E]/50 hover:bg-white/[0.02] transition-colors">
      {/* Direction */}
      <span
        className={`material-symbols-rounded text-sm ${
          t.direction === 'UPLOAD' ? 'text-[#7C6DFA]' : 'text-[#4ade80]'
        }`}
      >
        {t.direction === 'UPLOAD' ? 'upload' : 'download'}
      </span>

      {/* File name + path */}
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-mono text-slate-200 truncate" title={t.remotePath}>
          {fileName(t.remotePath)}
        </span>
        <span className="text-[10px] font-mono text-slate-600 truncate" title={t.remotePath}>
          {t.remotePath}
        </span>
      </div>

      {/* Size */}
      <div className="w-32 text-right">
        {t.totalBytes > 0 ? (
          <span className="text-[10px] font-mono text-slate-400">
            {isActive
              ? `${formatBytes(t.bytesTransferred)} / ${formatBytes(t.totalBytes)}`
              : formatBytes(t.totalBytes)}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-slate-600">—</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-32">
        {t.state !== 'CANCELLED' ? (
          <div className="h-1.5 bg-[#1E1E2E] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                t.state === 'COMPLETED'
                  ? 'bg-[#4ade80]'
                  : t.state === 'FAILED'
                  ? 'bg-red-500'
                  : 'bg-[#7C6DFA]'
              }`}
              style={{ width: `${t.state === 'COMPLETED' ? 100 : pct}%` }}
            />
          </div>
        ) : (
          <span className="text-[10px] font-mono text-slate-600">—</span>
        )}
      </div>

      {/* Status badge */}
      <div className="w-24 flex justify-end">
        <StateBadge state={t.state} />
      </div>

      {/* Time */}
      <div className="w-20 text-right">
        <span className="text-[10px] font-mono text-slate-500">
          {formatRelativeTime(t.startedAt)}
        </span>
      </div>
    </div>
  );
}

function StatsCard({ label, value, icon, accent }: { label: string; value: string; icon: string; accent?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#13131E] border border-[#1E1E2E] rounded-lg">
      <span className="material-symbols-rounded text-lg" style={{ color: accent ?? '#94a3b8' }}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider truncate">{label}</div>
        <div className="text-sm font-bold mt-0.5 truncate" style={{ color: accent ?? '#e2e8f0' }}>{value}</div>
      </div>
    </div>
  );
}
