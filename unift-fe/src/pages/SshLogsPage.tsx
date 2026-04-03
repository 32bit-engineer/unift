/**
 * SSH Session Logs — Shows session activity log, connection events,
 * session metadata, and transfer history for an SSH session.
 * Streams analytics updates via SSE while page is open.
 *
 * Data source: remoteConnectionAPI.getSessionAnalytics + getTransfers
 */
import { useCallback, useEffect, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { SessionAnalyticsResponse, TransferStatusResponse } from '@/utils/remoteConnectionAPI';

interface SshLogsPageProps {
  sessionId: string;
}

interface ActivityEvent {
  time: string;
  icon: string;
  label: string;
  detail: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildActivityEvents(analytics: SessionAnalyticsResponse): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  events.push({
    time: analytics.generatedAt,
    icon: 'lan',
    label: 'Session Active',
    detail: `Connected to ${analytics.host} as ${analytics.username} (${analytics.state})`,
  });

  events.push({
    time: analytics.generatedAt,
    icon: 'timer',
    label: 'Duration',
    detail: `Running for ${analytics.sessionDurationFormatted}`,
  });

  if (analytics.metadata.sshCipher) {
    events.push({
      time: analytics.generatedAt,
      icon: 'lock',
      label: 'Encryption',
      detail: `Cipher: ${analytics.metadata.sshCipher}${analytics.metadata.encryption ? ` / ${analytics.metadata.encryption}` : ''}`,
    });
  }

  if (analytics.metadata.remoteOs) {
    events.push({
      time: analytics.generatedAt,
      icon: 'computer',
      label: 'Remote OS',
      detail: analytics.metadata.remoteOs,
    });
  }

  if (analytics.metadata.tunnelMode) {
    events.push({
      time: analytics.generatedAt,
      icon: 'vpn_key',
      label: 'Tunnel Mode',
      detail: analytics.metadata.tunnelMode,
    });
  }

  if (analytics.metadata.lastHeartbeat) {
    events.push({
      time: analytics.metadata.lastHeartbeat,
      icon: 'favorite',
      label: 'Last Heartbeat',
      detail: new Date(analytics.metadata.lastHeartbeat).toLocaleString(),
    });
  }

  return events;
}

function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No activity events</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {events.map((evt, i) => (
        <div key={i} className="flex gap-3 py-2 border-b" style={{ borderColor: 'var(--color-border-muted)' }}>
          <span
            className="material-symbols-rounded mt-0.5 flex-shrink-0"
            style={{ fontSize: 16, color: 'var(--color-primary)' }}
          >
            {evt.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{evt.label}</span>
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                {new Date(evt.time).toLocaleTimeString()}
              </span>
            </div>
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{evt.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TransferStatusBadge({ state }: { state: string }) {
  const colorMap: Record<string, string> = {
    COMPLETED: '#4ade80',
    IN_PROGRESS: '#60a5fa',
    PENDING: '#facc15',
    FAILED: '#f87171',
    CANCELLED: '#94a3b8',
  };
  const color = colorMap[state] ?? '#94a3b8';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${color}20`, color }}
    >
      {state}
    </span>
  );
}

function TransferLogTable({ transfers }: { transfers: TransferStatusResponse[] }) {
  if (transfers.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No transfers recorded for this session</span>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--color-border-muted)' }}>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>Path</th>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>Direction</th>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>Progress</th>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>Size</th>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>Status</th>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--color-text-muted)' }}>Started</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map(t => (
            <tr key={t.transferId} className="border-b" style={{ borderColor: 'var(--color-border-muted)' }}>
              <td className="py-2 px-2 truncate max-w-[200px]" style={{ color: 'var(--color-text-primary)' }}>{t.remotePath}</td>
              <td className="py-2 px-2" style={{ color: 'var(--color-text-secondary)' }}>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-rounded" style={{ fontSize: 14 }}>
                    {t.direction === 'UPLOAD' ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                  {t.direction}
                </span>
              </td>
              <td className="py-2 px-2" style={{ color: 'var(--color-text-secondary)' }}>{t.progressPercent}%</td>
              <td className="py-2 px-2" style={{ color: 'var(--color-text-secondary)' }}>{formatBytes(t.totalBytes)}</td>
              <td className="py-2 px-2"><TransferStatusBadge state={t.state} /></td>
              <td className="py-2 px-2" style={{ color: 'var(--color-text-muted)' }}>{new Date(t.startedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SshLogsPage({ sessionId }: SshLogsPageProps) {
  const [analytics, setAnalytics] = useState<SessionAnalyticsResponse | null>(null);
  const [transfers, setTransfers] = useState<TransferStatusResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const transfersRes = await remoteConnectionAPI.getTransfers(sessionId);

      setTransfers(transfersRes);

      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError('Failed to load session logs.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchData();
  }, [sessionId]);

  useEffect(() => {
    let stop: (() => void) | null = null;
    void remoteConnectionAPI
      .streamTransfers(
        sessionId,
        2000,
        (list) => {
          setTransfers(list);
          setLastUpdated(new Date());
          setError(null);
          setLoading(false);
        },
        () => {
          // Non-fatal; analytics stream can still keep the page live.
        },
      )
      .then((s) => {
        stop = s;
      });

    return () => {
      stop?.();
    };
  }, [sessionId]);

  useEffect(() => {
    let stop: (() => void) | null = null;
    void remoteConnectionAPI
      .streamSessionAnalytics(
        sessionId,
        5000,
        (res) => {
          setAnalytics(res);
          setLastUpdated(new Date());
          setError(null);
          setLoading(false);
        },
        () => {
          setError('Live analytics stream disconnected.');
          setLoading(false);
        },
      )
      .then((s) => {
        stop = s;
      });

    return () => {
      stop?.();
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading session logs...</span>
        </div>
      </div>
    );
  }

  if (error && !analytics) {
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

  const activityEvents = analytics ? buildActivityEvents(analytics) : [];

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h1 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Session Logs</h1>
        {lastUpdated && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Activity Timeline */}
      <div className="px-6 pb-4">
        <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-rounded" style={{ fontSize: 18, color: 'var(--color-primary)' }}>timeline</span>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Activity Timeline</span>
          </div>
          <ActivityTimeline events={activityEvents} />
        </div>
      </div>

      {/* Transfer Log */}
      <div className="px-6 pb-4">
        <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-rounded" style={{ fontSize: 18, color: 'var(--color-primary)' }}>swap_vert</span>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Transfer Log</span>
          </div>
          <TransferLogTable transfers={transfers} />
        </div>
      </div>

      {/* Command History Placeholder */}
      <div className="px-6 pb-6">
        <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-rounded" style={{ fontSize: 18, color: 'var(--color-primary)' }}>terminal</span>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Command History</span>
          </div>
          <div className="flex items-center justify-center py-6">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Command history will be available in a future update
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
