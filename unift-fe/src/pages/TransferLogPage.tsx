import { useState, useEffect, useCallback } from 'react';
import {
  remoteConnectionAPI,
  type TransferLogResponse,
  type TransferHistoryStatsResponse,
} from '@/utils/remoteConnectionAPI';
import { TRANSFER_PAGE_SIZE } from '@/config/pagination';

type StatusFilter = 'ALL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

function formatBytes(bytes: number | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function formatSpeed(bps: number | undefined): string {
  if (bps == null) return '—';
  if (bps >= 1_073_741_824) return `${(bps / 1_073_741_824).toFixed(1)} GB/s`;
  if (bps >= 1_048_576) return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${bps} B/s`;
}

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const STATUS_BADGE: Record<
  'COMPLETED' | 'FAILED' | 'CANCELLED',
  { label: string; classes: string }
> = {
  COMPLETED: { label: 'Completed', classes: 'bg-green-900/40 text-[#4ade80] border border-green-700/40' },
  FAILED:    { label: 'Failed',    classes: 'bg-red-900/40 text-red-400 border border-red-700/40' },
  CANCELLED: { label: 'Cancelled', classes: 'bg-slate-800/60 text-slate-500 border border-[#1E1E2E]' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status as keyof typeof STATUS_BADGE];
  if (!cfg) return null;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${cfg.classes}`}
    >
      {cfg.label}
    </span>
  );
}

function StatsCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
}) {
  return (
    <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-3">{label}</p>
      {loading ? (
        <div className="h-6 w-20 rounded shimmer" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[22px] font-bold text-slate-100 leading-none font-mono">{value}</span>
          {sub && <span className="text-sm text-slate-600 font-mono">{sub}</span>}
        </div>
      )}
    </div>
  );
}

/* Pagination constants */
const PAGE_SIZE = TRANSFER_PAGE_SIZE;

export function TransferLogPage() {
  const [entries, setEntries]         = useState<TransferLogResponse[]>([]);
  const [stats, setStats]             = useState<TransferHistoryStatsResponse | null>(null);
  const [loading, setLoading]         = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [page, setPage]               = useState(0);
  const [hasMore, setHasMore]         = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await remoteConnectionAPI.getTransferHistoryStats();
      setStats(data);
    } catch {
      /* non-critical */
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchPage = useCallback(async (pageIndex: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await remoteConnectionAPI.listTransferHistory(pageIndex, PAGE_SIZE);
      setEntries(data.items);
      setHasMore(data.items.length === PAGE_SIZE);
      setPage(pageIndex);
    } catch {
      setError('Failed to load transfer history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
    void fetchPage(0);
  }, [fetchStats, fetchPage]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await remoteConnectionAPI.deleteTransferHistoryEntry(id);
      setEntries(prev => prev.filter(e => e.id !== id));
      // Refresh stats after deletion
      void fetchStats();
    } catch {
      /* non-critical */
    } finally {
      setDeletingId(null);
    }
  };

  // Client-side status filter
  const filtered =
    statusFilter === 'ALL'
      ? entries
      : entries.filter(e => e.status === statusFilter);

  return (
    <div className="h-full flex flex-col overflow-hidden p-6">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Transfer Log
          </h2>
          <p className="text-xs font-mono text-slate-500 mt-0.5">
            Persistent audit trail of all completed, failed, and cancelled transfers.
          </p>
        </div>
        <button
          onClick={() => { void fetchPage(0); void fetchStats(); }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#13131E] border border-[#1E1E2E] rounded text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-[#171724] transition-colors cursor-pointer disabled:opacity-50"
        >
          <span className={`material-symbols-rounded text-sm ${loading ? 'animate-spin' : ''}`}>
            refresh
          </span>
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3 mb-6 shrink-0">
        <StatsCard
          label="Total Transfers"
          value={stats ? String(stats.totalTransfers) : '—'}
          loading={statsLoading}
        />
        <StatsCard
          label="Completed"
          value={stats ? String(stats.completedTransfers) : '—'}
          loading={statsLoading}
        />
        <StatsCard
          label="Failed"
          value={stats ? String(stats.failedTransfers) : '—'}
          loading={statsLoading}
        />
        <StatsCard
          label="Cancelled"
          value={stats ? String(stats.cancelledTransfers) : '—'}
          loading={statsLoading}
        />
        <StatsCard
          label="Total Bytes"
          value={stats?.totalBytesTransferred != null ? formatBytes(stats.totalBytesTransferred) : '—'}
          sub={stats?.avgSpeedBps != null ? `avg ${formatSpeed(stats.avgSpeedBps)}` : undefined}
          loading={statsLoading}
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <span className="text-xs font-mono text-slate-500">Status:</span>
        <div className="flex items-center bg-[#13131E] border border-[#1E1E2E] rounded overflow-hidden">
          {(['ALL', 'COMPLETED', 'FAILED', 'CANCELLED'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 text-[10px] font-mono cursor-pointer transition-colors ${
                statusFilter === s
                  ? 'bg-[#7C6DFA] text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <span className="text-[10px] font-mono text-slate-600 ml-auto">
          {filtered.length} entries
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg border border-red-800/40 bg-red-950/30 shrink-0">
          <span className="material-symbols-rounded text-sm text-red-400">error</span>
          <p className="text-[11px] text-red-400">{error}</p>
        </div>
      )}

      {/* Table */}
      {loading && entries.length === 0 ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
          <span className="material-symbols-rounded text-lg animate-spin">hourglass_bottom</span>
          <span className="text-xs font-mono">Loading transfer log...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 opacity-40">
          <span className="material-symbols-rounded text-4xl text-slate-500">history</span>
          <p className="text-xs font-mono text-slate-500 text-center max-w-xs">
            No transfer records yet. Completed transfers will appear here.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar rounded-lg border border-[#1E1E2E]">
          {/* Table header */}
          <div
            className="grid gap-3 px-4 py-2 bg-[#13131E] border-b border-[#1E1E2E] sticky top-0 z-10"
            style={{ gridTemplateColumns: '1fr 80px 100px 90px 80px 90px 32px' }}
          >
            {['File', 'Size', 'Speed', 'Duration', 'Status', 'Date', ''].map((h, i) => (
              <span
                key={i}
                className={`text-[10px] font-mono text-slate-500 uppercase tracking-wider ${
                  i > 0 && i < 6 ? 'text-right' : ''
                }`}
              >
                {h}
              </span>
            ))}
          </div>

          {filtered.map(entry => (
            <TransferLogRow
              key={entry.id}
              entry={entry}
              deleting={deletingId === entry.id}
              onDelete={() => void handleDelete(entry.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {(page > 0 || hasMore) && (
        <div className="flex items-center justify-between pt-3 shrink-0">
          <button
            onClick={() => void fetchPage(page - 1)}
            disabled={page === 0 || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#1E1E2E] text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors disabled:opacity-30 cursor-pointer"
          >
            <span className="material-symbols-rounded text-sm">chevron_left</span>
            Prev
          </button>
          <span className="text-[10px] font-mono text-slate-600">Page {page + 1}</span>
          <button
            onClick={() => void fetchPage(page + 1)}
            disabled={!hasMore || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#1E1E2E] text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors disabled:opacity-30 cursor-pointer"
          >
            Next
            <span className="material-symbols-rounded text-sm">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface TransferLogRowProps {
  entry: TransferLogResponse;
  deleting: boolean;
  onDelete: () => void;
}

function TransferLogRow({ entry, deleting, onDelete }: TransferLogRowProps) {
  /* Infer direction from source/destination paths */
  const isUpload = !entry.source.startsWith('/') || entry.destination.startsWith('/');

  return (
    <div
      className="grid gap-3 items-center px-4 py-2.5 border-b border-[#1E1E2E]/50 hover:bg-white/2 transition-colors"
      style={{ gridTemplateColumns: '1fr 80px 100px 90px 80px 90px 32px' }}
    >
      {/* File name + paths */}
      <div className="flex flex-col min-w-0 gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`material-symbols-rounded text-sm shrink-0 ${
              isUpload ? 'text-[#7C6DFA]' : 'text-[#4ade80]'
            }`}
          >
            {isUpload ? 'upload' : 'download'}
          </span>
          <span
            className="text-xs font-mono text-slate-200 truncate"
            title={entry.filename}
          >
            {entry.filename}
          </span>
        </div>
        <span
          className="text-[10px] font-mono text-slate-600 truncate"
          title={`${entry.source} → ${entry.destination}`}
        >
          {entry.source} → {entry.destination}
        </span>
      </div>

      {/* Size */}
      <div className="text-right">
        <span className="text-[10px] font-mono text-slate-400">{formatBytes(entry.sizeBytes)}</span>
      </div>

      {/* Avg speed */}
      <div className="text-right">
        <span className="text-[10px] font-mono text-slate-400">{formatSpeed(entry.avgSpeedBps)}</span>
      </div>

      {/* Duration */}
      <div className="text-right">
        <span className="text-[10px] font-mono text-slate-400">{formatDuration(entry.durationMs)}</span>
      </div>

      {/* Status */}
      <div className="flex justify-end">
        <StatusBadge status={entry.status} />
      </div>

      {/* Date */}
      <div className="text-right">
        <span className="text-[10px] font-mono text-slate-500">
          {formatRelativeTime(entry.createdAt)}
        </span>
      </div>

      {/* Delete */}
      <div className="flex justify-end">
        <button
          onClick={onDelete}
          disabled={deleting}
          title="Delete entry"
          className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer disabled:opacity-40"
        >
          <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
            delete
          </span>
        </button>
      </div>
    </div>
  );
}
