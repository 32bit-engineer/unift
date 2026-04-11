import { useState, useEffect, useCallback, useRef } from 'react';
import { remoteConnectionAPI, type TransferLogResponse, type TransferHistoryStatsResponse } from '@/utils/remoteConnectionAPI';
import { Input } from '@/components/ui/input';

type FilterStatus = 'ALL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

const PAGE_SIZE = 20;

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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  COMPLETED: { label: 'Done',      classes: 'bg-green-900/40 text-[#4ade80] border border-green-700/40' },
  FAILED:    { label: 'Failed',    classes: 'bg-red-900/40 text-red-400 border border-red-700/40' },
  CANCELLED: { label: 'Cancelled', classes: 'bg-slate-800/60 text-slate-500 border border-[#1E1E2E]' },
};

function StatusBadge({ status }: { status: string }) {
  const b = STATUS_BADGE[status] ?? { label: status, classes: 'bg-slate-800 text-slate-400' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${b.classes}`}>
      {b.label}
    </span>
  );
}

/** source === "client" means the user uploaded; otherwise it was a download. */
function isUploadRow(source: string): boolean {
  return source === 'client';
}

export function TransferHistoryPage() {
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TransferLogResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [searchSession, setSearchSession] = useState('');
  const [searchUsername, setSearchUsername] = useState('');
  const [debouncedSession, setDebouncedSession] = useState('');
  const [debouncedUsername, setDebouncedUsername] = useState('');
  const [transferStats, setTransferStats] = useState<TransferHistoryStatsResponse | null>(null);

  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSessionInput = (v: string) => {
    setSearchSession(v);
    if (sessionTimer.current) clearTimeout(sessionTimer.current);
    sessionTimer.current = setTimeout(() => setDebouncedSession(v), 300);
  };

  const handleUsernameInput = (v: string) => {
    setSearchUsername(v);
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    usernameTimer.current = setTimeout(() => setDebouncedUsername(v), 300);
  };

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const resp = await remoteConnectionAPI.listTransferHistory(
        p,
        PAGE_SIZE,
        debouncedSession || undefined,
        debouncedUsername || undefined,
        filterStatus !== 'ALL' ? filterStatus : undefined,
      );
      setItems(resp.items);
      setTotal(resp.total);
      setHasMore(resp.hasMore);
    } catch {
      setItems([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [debouncedSession, debouncedUsername, filterStatus]);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [debouncedSession, debouncedUsername, filterStatus]);

  useEffect(() => { void load(page); }, [load, page]);

  // Stats SSE stream
  useEffect(() => {
    let stop: (() => void) | null = null;
    void remoteConnectionAPI.getTransferHistoryStats().then(s => setTransferStats(s)).catch(() => {});
    void remoteConnectionAPI
      .streamTransferHistoryStats(30_000, s => setTransferStats(s), () => {})
      .then(s => { stop = s; });
    return () => { stop?.(); };
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="h-full flex flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Transfer History</h2>
          <p className="text-xs font-mono text-slate-500 mt-0.5">
            All uploads and downloads across all connections.
          </p>
        </div>
        <button
          onClick={() => void load(page)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#13131E] border border-[#1E1E2E] rounded text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-[#171724] transition-colors cursor-pointer disabled:opacity-50"
        >
          <span className={`material-symbols-rounded text-sm ${loading ? 'animate-spin' : ''}`}>refresh</span>
          Refresh
        </button>
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
            icon="storage" accent="#7C6DFA"
          />
          <StatsCard
            label="Avg Speed"
            value={transferStats.avgSpeedBps != null ? formatBytes(transferStats.avgSpeedBps) + '/s' : '—'}
            icon="speed"
          />
        </div>
      )}

      {/* Search + Filter bar */}
      <div className="flex items-center gap-3 mb-4 shrink-0 flex-wrap">
        {/* Session ID search */}
        <div className="flex items-center gap-1.5 bg-[#13131E] border border-[#1E1E2E] rounded px-2.5 py-1">
          <span className="material-symbols-rounded text-[13px] text-slate-500">tag</span>
          <Input
            type="text"
            value={searchSession}
            onChange={e => handleSessionInput(e.target.value)}
            placeholder="Session ID"
            className="bg-transparent border-0 shadow-none h-auto py-0 rounded-none focus:border-0 focus:shadow-none text-[11px] font-mono text-slate-300 placeholder:text-slate-600 w-40"
          />
          {searchSession && (
            <button onClick={() => handleSessionInput('')} className="text-slate-600 hover:text-slate-400 cursor-pointer">
              <span className="material-symbols-rounded text-[13px]">close</span>
            </button>
          )}
        </div>

        {/* Username search */}
        <div className="flex items-center gap-1.5 bg-[#13131E] border border-[#1E1E2E] rounded px-2.5 py-1">
          <span className="material-symbols-rounded text-[13px] text-slate-500">person</span>
          <Input
            type="text"
            value={searchUsername}
            onChange={e => handleUsernameInput(e.target.value)}
            placeholder="Username"
            className="bg-transparent border-0 shadow-none h-auto py-0 rounded-none focus:border-0 focus:shadow-none text-[11px] font-mono text-slate-300 placeholder:text-slate-600 w-28"
          />
          {searchUsername && (
            <button onClick={() => handleUsernameInput('')} className="text-slate-600 hover:text-slate-400 cursor-pointer">
              <span className="material-symbols-rounded text-[13px]">close</span>
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="flex items-center bg-[#13131E] border border-[#1E1E2E] rounded overflow-hidden">
          {(['ALL', 'COMPLETED', 'FAILED', 'CANCELLED'] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 text-[10px] font-mono cursor-pointer transition-colors ${
                filterStatus === s ? 'bg-[#7C6DFA] text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <span className="text-[10px] font-mono text-slate-600 ml-auto">
          {total} {total === 1 ? 'transfer' : 'transfers'}
        </span>
      </div>

      {/* Table */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
          <span className="material-symbols-rounded text-lg animate-spin">hourglass_bottom</span>
          <span className="text-xs font-mono">Loading...</span>
        </div>
      ) : items.length === 0 ? (
        <EmptyState message="No transfer history found." />
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar rounded-lg border border-[#1E1E2E] min-h-0">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-2 bg-[#13131E] border-b border-[#1E1E2E] sticky top-0 z-10">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider w-5" />
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">File / Session</span>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider w-28 text-right">Size</span>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider w-24 text-right">Speed</span>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider w-24 text-right">Status</span>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider w-20 text-right">Time</span>
          </div>

          {items.map(t => <HistoryRow key={t.id} item={t} />)}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 shrink-0">
          <button
            disabled={page === 0 || loading}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#13131E] border border-[#1E1E2E] rounded text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-[#171724] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <span className="material-symbols-rounded text-sm">chevron_left</span>
            Prev
          </button>
          <span className="text-[11px] font-mono text-slate-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={!hasMore || loading}
            onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#13131E] border border-[#1E1E2E] rounded text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-[#171724] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Next
            <span className="material-symbols-rounded text-sm">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 opacity-40">
      <span className="material-symbols-rounded text-4xl text-slate-500">swap_vert</span>
      <p className="text-xs font-mono text-slate-500 text-center max-w-xs">{message}</p>
    </div>
  );
}

function HistoryRow({ item: t }: { item: TransferLogResponse }) {
  const upload = isUploadRow(t.source);

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-2.5 border-b border-[#1E1E2E]/50 hover:bg-white/[0.02] transition-colors">
      {/* Direction icon */}
      <span className={`material-symbols-rounded text-sm ${upload ? 'text-[#7C6DFA]' : 'text-[#4ade80]'}`}>
        {upload ? 'upload' : 'download'}
      </span>

      {/* File + session meta */}
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-mono text-slate-200 truncate" title={t.filename}>
          {t.filename}
        </span>
        <span className="text-[10px] font-mono text-slate-600 truncate" title={t.source + ' → ' + t.destination}>
          {upload ? t.destination : t.source}
        </span>
        {(t.username || t.sessionId) && (
          <span className="text-[10px] font-mono text-slate-700 truncate mt-0.5">
            {t.username && <span className="text-slate-500">{t.username}</span>}
            {t.username && t.sessionId && <span className="mx-1 opacity-40">·</span>}
            {t.sessionId && <span title={t.sessionId}>{t.sessionId.slice(0, 8)}…</span>}
          </span>
        )}
      </div>

      {/* Size */}
      <div className="w-28 text-right">
        {t.sizeBytes != null ? (
          <span className="text-[10px] font-mono text-slate-400">{formatBytes(t.sizeBytes)}</span>
        ) : (
          <span className="text-[10px] font-mono text-slate-600">—</span>
        )}
      </div>

      {/* Speed / duration */}
      <div className="w-24 text-right">
        {t.avgSpeedBps != null ? (
          <span className="text-[10px] font-mono text-slate-400">
            {formatBytes(t.avgSpeedBps)}/s
          </span>
        ) : t.durationMs != null ? (
          <span className="text-[10px] font-mono text-slate-500">{formatDuration(t.durationMs)}</span>
        ) : (
          <span className="text-[10px] font-mono text-slate-600">—</span>
        )}
      </div>

      {/* Status badge */}
      <div className="w-24 flex justify-end">
        <StatusBadge status={t.status} />
      </div>

      {/* Time */}
      <div className="w-20 text-right">
        <span className="text-[10px] font-mono text-slate-500">{formatRelativeTime(t.createdAt)}</span>
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
