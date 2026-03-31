import { useState, useEffect, useCallback } from 'react';
import { useTransferStore } from '@/store/transferStore';
import { remoteConnectionAPI, type TransferStatusResponse, type TransferState } from '@/utils/remoteConnectionAPI';

interface TransferProgressPopupProps {
  /** IDs of all currently active sessions — used to poll for downloads */
  sessionIds: string[];
  /** Navigate to the transfer history page */
  onViewAll: () => void;
}

// Maximum number of completed/failed entries shown in the popup
const MAX_RECENT = 5;

// How many milliseconds between global polls of active transfers
const POLL_INTERVAL_MS = 2000;

// Returns a short filename from a remote path
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

const STATE_LABEL: Record<TransferState, string> = {
  PENDING:     'Pending',
  IN_PROGRESS: 'Transferring',
  COMPLETED:   'Done',
  FAILED:      'Failed',
  CANCELLED:   'Cancelled',
};

const STATE_COLOR: Record<TransferState, string> = {
  PENDING:     'text-slate-400',
  IN_PROGRESS: 'text-[#7C6DFA]',
  COMPLETED:   'text-[#4ade80]',
  FAILED:      'text-red-400',
  CANCELLED:   'text-slate-500',
};

export function TransferProgressPopup({ sessionIds, onViewAll }: TransferProgressPopupProps) {
  const { transfersBySession, setTransfers } = useTransferStore();
  const [expanded, setExpanded] = useState(false);

  // Flatten all transfers sorted newest first (by startedAt desc)
  const allTransfers: (TransferStatusResponse & { sessionId: string })[] =
    Object.entries(transfersBySession)
      .flatMap(([sessionId, list]) =>
        list.map(t => ({ ...t, sessionId }))
      )
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const activeTransfers = allTransfers.filter(
    t => t.state === 'PENDING' || t.state === 'IN_PROGRESS',
  );

  // Entries shown in the popup: active first, then up to MAX_RECENT recent ones
  const recentCompleted = allTransfers.filter(
    t => t.state === 'COMPLETED' || t.state === 'FAILED' || t.state === 'CANCELLED',
  ).slice(0, MAX_RECENT);

  const displayedTransfers = [...activeTransfers, ...recentCompleted];

  // Poll only sessions that have in-flight transfers — sessions with no active
  // transfers don't need continuous updates and should not generate network traffic.
  const pollAll = useCallback(async () => {
    const sessionsWithActive = Object.entries(transfersBySession)
      .filter(([, list]) => list.some(t => t.state === 'PENDING' || t.state === 'IN_PROGRESS'))
      .map(([id]) => id);

    for (const sessionId of sessionsWithActive) {
      try {
        const list = await remoteConnectionAPI.getTransfers(sessionId);
        setTransfers(sessionId, list);
      } catch {
        // Non-critical — session may have expired
      }
    }
  }, [transfersBySession, setTransfers]);

  useEffect(() => {
    if (!expanded && activeTransfers.length === 0) return;
    const id = setInterval(() => void pollAll(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [expanded, activeTransfers.length, pollAll]);

  // Initial fetch when a new session appears
  useEffect(() => {
    const unknown = sessionIds.filter(id => !(id in transfersBySession));
    if (unknown.length === 0) return;
    for (const sessionId of unknown) {
      remoteConnectionAPI.getTransfers(sessionId)
        .then(list => setTransfers(sessionId, list))
        .catch(() => { /* non-critical */ });
    }
  }, [sessionIds, transfersBySession, setTransfers]);

  // Only render the popup while there are in-flight transfers — hide completely otherwise
  if (activeTransfers.length === 0) return null;

  // ── Collapsed toggle button ────────────────────────────────────────
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        title="View transfers"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3 py-2.5 bg-[#13131E] border border-[#1E1E2E] rounded-xl shadow-2xl hover:bg-[#171724] transition-colors cursor-pointer group"
      >
        <span className="material-symbols-rounded text-[#7C6DFA] text-lg">swap_vert</span>
        <span className="text-xs font-mono text-slate-300">Transfers</span>
        {activeTransfers.length > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#7C6DFA] text-[10px] font-bold text-white">
            {activeTransfers.length}
          </span>
        )}
      </button>
    );
  }

  // ── Expanded panel ─────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-[#13131E] border border-[#1E1E2E] rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E1E2E] shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-rounded text-[#7C6DFA] text-base">swap_vert</span>
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Transfers</span>
          {activeTransfers.length > 0 && (
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#7C6DFA] text-[10px] font-bold text-white">
              {activeTransfers.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onViewAll}
            title="View full transfer history"
            className="text-[10px] font-mono text-[#7C6DFA] hover:text-blue-300 cursor-pointer px-1.5 py-0.5 rounded hover:bg-[#7C6DFA]/10 transition-colors"
          >
            View all
          </button>
          <button
            onClick={() => setExpanded(false)}
            title="Minimise"
            className="cursor-pointer p-0.5 hover:bg-white/5 rounded"
          >
            <span className="material-symbols-rounded text-slate-500 text-sm">remove</span>
          </button>
        </div>
      </div>

      {/* Transfer list */}
      {displayedTransfers.length === 0 ? (
        <div className="px-4 py-6 text-xs font-mono text-slate-600 text-center">
          No transfers yet
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto custom-scrollbar">
          {displayedTransfers.map(t => (
            <TransferRow key={`${t.sessionId}-${t.transferId}`} transfer={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Individual transfer row ────────────────────────────────────────────────
interface TransferRowProps {
  transfer: TransferStatusResponse;
}

function TransferRow({ transfer: t }: TransferRowProps) {
  const isActive = t.state === 'PENDING' || t.state === 'IN_PROGRESS';
  const pct = Math.min(100, Math.max(0, t.progressPercent ?? 0));

  return (
    <div className="flex flex-col gap-1 px-4 py-2.5 border-b border-[#1E1E2E]/50">
      <div className="flex items-center gap-2">
        {/* Direction icon */}
        <span
          className={`material-symbols-rounded text-sm shrink-0 ${
            t.direction === 'UPLOAD' ? 'text-[#7C6DFA]' : 'text-[#4ade80]'
          }`}
        >
          {t.direction === 'UPLOAD' ? 'upload' : 'download'}
        </span>

        {/* File name */}
        <span className="text-xs font-mono text-slate-300 flex-1 truncate" title={t.remotePath}>
          {fileName(t.remotePath)}
        </span>

        {/* Status label */}
        <span className={`text-[10px] font-mono shrink-0 ${STATE_COLOR[t.state]}`}>
          {t.state === 'IN_PROGRESS' ? `${pct}%` : STATE_LABEL[t.state]}
        </span>
      </div>

      {/* Progress bar (only for active or completed transfers) */}
      {t.state !== 'CANCELLED' && (
        <div className="h-1 bg-[#1E1E2E] rounded-full overflow-hidden">
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
      )}

      {/* Bytes transferred */}
      {isActive && t.totalBytes > 0 && (
        <span className="text-[10px] font-mono text-slate-500">
          {formatBytes(t.bytesTransferred)} / {formatBytes(t.totalBytes)}
        </span>
      )}

      {/* Error message */}
      {t.state === 'FAILED' && t.errorMessage && (
        <span className="text-[10px] font-mono text-red-400 truncate" title={t.errorMessage}>
          {t.errorMessage}
        </span>
      )}
    </div>
  );
}
