import { useState, useEffect, useCallback } from 'react';
import {
  remoteConnectionAPI,
  type UploadSessionResponse,
  type UploadSessionStatus,
} from '@/utils/remoteConnectionAPI';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const STATUS_CONFIG: Record<
  UploadSessionStatus,
  { label: string; classes: string; dot: string }
> = {
  PENDING:     { label: 'Pending',    classes: 'bg-slate-800 text-slate-400 border border-slate-700', dot: 'bg-slate-500' },
  IN_PROGRESS: { label: 'Uploading',  classes: 'bg-blue-900/40 text-[#7C6DFA] border border-blue-700/40', dot: 'bg-[#7C6DFA] animate-pulse' },
  COMPLETED:   { label: 'Completed',  classes: 'bg-green-900/40 text-[#4ade80] border border-green-700/40', dot: 'bg-[#4ade80]' },
  FAILED:      { label: 'Failed',     classes: 'bg-red-900/40 text-red-400 border border-red-700/40', dot: 'bg-red-400' },
  EXPIRED:     { label: 'Expired',    classes: 'bg-amber-900/30 text-amber-400 border border-amber-800/40', dot: 'bg-amber-400' },
};

function StatusBadge({ status }: { status: UploadSessionStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${cfg.classes}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const ALL_STATUSES: (UploadSessionStatus | 'ALL')[] = [
  'ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'EXPIRED',
];

export function UploadSessionsPage() {
  const [sessions, setSessions]       = useState<UploadSessionResponse[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<UploadSessionStatus | 'ALL'>('ALL');
  const [abortingId, setAbortingId]   = useState<string | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  const fetchSessions = useCallback(async (filter: UploadSessionStatus | 'ALL') => {
    setLoading(true);
    setError(null);
    try {
      const data = await remoteConnectionAPI.listUploadSessions(
        filter === 'ALL' ? undefined : filter,
      );
      setSessions(data);
    } catch {
      setError('Failed to load upload sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions(statusFilter);
  }, [fetchSessions, statusFilter]);

  const handleAbort = async (sessionId: string) => {
    setAbortingId(sessionId);
    try {
      await remoteConnectionAPI.abortUploadSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch {
      /* non-critical */
    } finally {
      setAbortingId(null);
    }
  };

  const activeCount = sessions.filter(
    s => s.status === 'PENDING' || s.status === 'IN_PROGRESS',
  ).length;
  const completedCount = sessions.filter(s => s.status === 'COMPLETED').length;

  return (
    <div className="h-full flex flex-col overflow-hidden p-6">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Upload Sessions
          </h2>
          <p className="text-xs font-mono text-slate-500 mt-0.5">
            Resumable chunked upload sessions. Track which chunks have been delivered.
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
            onClick={() => void fetchSessions(statusFilter)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#13131E] border border-[#1E1E2E] rounded text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-[#171724] transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className={`material-symbols-rounded text-sm ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            Refresh
          </button>
        </div>
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-6 shrink-0">
        <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-2">Total Sessions</p>
          <p className="text-[22px] font-bold text-slate-100 font-mono leading-none">{sessions.length}</p>
        </div>
        <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-2">Active</p>
          <p className="text-[22px] font-bold text-[#7C6DFA] font-mono leading-none">{activeCount}</p>
        </div>
        <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-2">Completed</p>
          <p className="text-[22px] font-bold text-[#4ade80] font-mono leading-none">{completedCount}</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <span className="text-xs font-mono text-slate-500">Status:</span>
        <div className="flex items-center bg-[#13131E] border border-[#1E1E2E] rounded overflow-hidden">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 text-[10px] font-mono cursor-pointer transition-colors ${
                statusFilter === s
                  ? 'bg-[#7C6DFA] text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {s === 'ALL' ? 'All' : s === 'IN_PROGRESS' ? 'Uploading' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <span className="text-[10px] font-mono text-slate-600 ml-auto">
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg border border-red-800/40 bg-red-950/30 shrink-0">
          <span className="material-symbols-rounded text-sm text-red-400">error</span>
          <p className="text-[11px] text-red-400">{error}</p>
        </div>
      )}

      {/* Session list */}
      {loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
          <span className="material-symbols-rounded text-lg animate-spin">hourglass_bottom</span>
          <span className="text-xs font-mono">Loading upload sessions...</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 opacity-40">
          <span className="material-symbols-rounded text-4xl text-slate-500">cloud_upload</span>
          <p className="text-xs font-mono text-slate-500 text-center max-w-xs">
            No upload sessions found. Resumable uploads will appear here.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar rounded-lg border border-[#1E1E2E]">
          {/* Header */}
          <div
            className="grid gap-3 px-4 py-2 bg-[#13131E] border-b border-[#1E1E2E] sticky top-0 z-10"
            style={{ gridTemplateColumns: '1fr 90px 100px 80px 110px 80px 36px' }}
          >
            {['File', 'Size', 'Progress', 'Chunks', 'Destination', 'Created', ''].map((h, i) => (
              <span
                key={i}
                className={`text-[10px] font-mono text-slate-500 uppercase tracking-wider ${
                  i >= 1 && i <= 5 ? 'text-right' : ''
                }`}
              >
                {h}
              </span>
            ))}
          </div>

          {sessions.map(s => (
            <UploadSessionRow
              key={s.id}
              session={s}
              expanded={expandedId === s.id}
              aborting={abortingId === s.id}
              onToggleExpand={() => setExpandedId(prev => prev === s.id ? null : s.id)}
              onAbort={() => void handleAbort(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface UploadSessionRowProps {
  session: UploadSessionResponse;
  expanded: boolean;
  aborting: boolean;
  onToggleExpand: () => void;
  onAbort: () => void;
}

function UploadSessionRow({
  session: s,
  expanded,
  aborting,
  onToggleExpand,
  onAbort,
}: UploadSessionRowProps) {
  const pct = Math.min(100, Math.max(0, s.progressPercent));
  const canAbort = s.status === 'PENDING' || s.status === 'IN_PROGRESS';

  const progressColor =
    s.status === 'COMPLETED' ? 'bg-[#4ade80]' :
    s.status === 'FAILED'    ? 'bg-red-500'    :
    s.status === 'EXPIRED'   ? 'bg-amber-500'  :
    'bg-[#7C6DFA]';

  return (
    <>
      <div
        className="grid gap-3 items-center px-4 py-2.5 border-b border-[#1E1E2E]/50 hover:bg-white/2 transition-colors cursor-pointer"
        style={{ gridTemplateColumns: '1fr 90px 100px 80px 110px 80px 36px' }}
        onClick={onToggleExpand}
      >
        {/* Filename */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="material-symbols-rounded shrink-0 text-slate-600 transition-transform"
            style={{ fontSize: '14px', transform: expanded ? 'rotate(90deg)' : 'none' }}
          >
            chevron_right
          </span>
          <span className="text-xs font-mono text-slate-200 truncate" title={s.filename}>
            {s.filename}
          </span>
        </div>

        {/* Total size */}
        <div className="text-right">
          <span className="text-[10px] font-mono text-slate-400">{formatBytes(s.totalSize)}</span>
        </div>

        {/* Progress bar + % */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-[#1E1E2E] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-500 w-8 text-right shrink-0">{pct}%</span>
        </div>

        {/* Chunks acknowledged */}
        <div className="text-right">
          <span className="text-[10px] font-mono text-slate-400">
            {s.receivedChunks.length}/{s.totalChunks}
          </span>
        </div>

        {/* Status badge */}
        <div className="flex justify-end">
          <StatusBadge status={s.status} />
        </div>

        {/* Created */}
        <div className="text-right">
          <span className="text-[10px] font-mono text-slate-500">
            {formatRelativeTime(s.createdAt)}
          </span>
        </div>

        {/* Abort button */}
        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
          {canAbort && (
            <button
              onClick={onAbort}
              disabled={aborting}
              title="Abort session"
              className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer disabled:opacity-40"
            >
              <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
                cancel
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="px-6 py-3 bg-[#0C0C14] border-b border-[#1E1E2E]/50">
          <div className="grid grid-cols-2 gap-6">
            {/* Left: session details */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-1">Session Details</p>
              <DetailRow label="Session ID" value={s.id} />
              <DetailRow label="Destination" value={s.destinationPath} />
              <DetailRow label="Chunk Size" value={formatBytes(s.chunkSize)} />
              <DetailRow label="Expires" value={formatRelativeTime(s.expiresAt)} />
            </div>

            {/* Right: chunk grid */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-2">
                Chunk Map ({s.receivedChunks.length}/{s.totalChunks})
              </p>
              <ChunkGrid total={s.totalChunks} received={s.receivedChunks} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] text-slate-500 shrink-0">{label}</span>
      <span className="text-[10px] font-mono text-slate-300 truncate text-right" title={value}>
        {value}
      </span>
    </div>
  );
}

function ChunkGrid({ total, received }: { total: number; received: number[] }) {
  const receivedSet = new Set(received);
  /* Cap render to 200 chunks in the grid to keep the DOM clean */
  const limit = Math.min(total, 200);

  return (
    <div className="flex flex-wrap gap-0.5">
      {Array.from({ length: limit }, (_, i) => (
        <span
          key={i}
          title={`Chunk ${i}`}
          className={`w-3 h-3 rounded-sm shrink-0 ${
            receivedSet.has(i) ? 'bg-[#7C6DFA]' : 'bg-[#13131E]'
          }`}
        />
      ))}
      {total > limit && (
        <span className="text-[9px] font-mono text-slate-600 self-center ml-1">
          +{total - limit} more
        </span>
      )}
    </div>
  );
}
