/**
 * Docker Containers List — Displays all containers on the remote host
 * with status badges, image source, ports, uptime, and action controls.
 *
 * Design reference: designs/unift/containers_list/screen.png
 *
 * Data source: DockerController.listContainers + getContainerStats
 * via remoteConnectionAPI.listDockerContainers / getDockerContainerStats
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type {
  DockerContainer,
  DockerContainerStats,
  ContainerPage,
  ContainerActionResult,
  ContainerDetail,
  CreateContainerRequest,
} from '@/utils/remoteConnectionAPI';

interface DockerContainersPageProps {
  sessionId: string;
}

type StatusFilter = 'all' | 'running' | 'stopped' | 'exited';
type SortMode = 'latest' | 'name' | 'status';

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  running: { bg: 'rgba(74,222,128,0.10)', text: '#4ade80', dot: '#4ade80' },
  exited:  { bg: 'rgba(248,113,113,0.10)', text: '#f87171', dot: '#f87171' },
  paused:  { bg: 'rgba(250,204,21,0.10)', text: '#facc15', dot: '#facc15' },
  created: { bg: 'rgba(144,144,176,0.10)', text: '#9090B0', dot: '#9090B0' },
  dead:    { bg: 'rgba(248,113,113,0.10)', text: '#f87171', dot: '#f87171' },
};

function getStatusStyle(state: string) {
  const lower = state.toLowerCase();
  return STATUS_STYLES[lower] ?? STATUS_STYLES['created'];
}

function formatUptime(status: string): string {
  if (!status) return '-';
  const upMatch = status.match(/Up\s+(.+)/i);
  if (upMatch) return upMatch[1];
  const exitMatch = status.match(/Exited\s+\((\d+)\)\s+(.+)\s+ago/i);
  if (exitMatch) return `${exitMatch[2]} ago`;
  return status;
}

export function DockerContainersPage({ sessionId }: DockerContainersPageProps) {
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [stats, setStats] = useState<DockerContainerStats[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [inspectModal, setInspectModal] = useState<ContainerDetail | null>(null);
  const [execModal, setExecModal] = useState<{ containerId: string; name: string } | null>(null);

  const fetchContainers = useCallback(async () => {
    try {
      setLoading(true);
      const res: ContainerPage = await remoteConnectionAPI.listDockerContainers(
        sessionId, true, page, pageSize,
      );
      setContainers(res.containers);
      setTotal(res.total);
    } catch {
      // API error — containers stay empty
    } finally {
      setLoading(false);
    }
  }, [sessionId, page, pageSize]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await remoteConnectionAPI.getDockerContainerStats(sessionId);
      setStats(res);
    } catch {
      // Stats are optional — may fail if no running containers
    }
  }, [sessionId]);

  useEffect(() => {
    fetchContainers();
    fetchStats();
  }, [fetchContainers, fetchStats]);

  const statsMap = useMemo(() => {
    const map = new Map<string, DockerContainerStats>();
    for (const s of stats) {
      map.set(s.containerId, s);
    }
    return map;
  }, [stats]);

  const filteredContainers = useMemo(() => {
    let filtered = containers;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => {
        const lower = c.state.toLowerCase();
        if (statusFilter === 'stopped') return lower === 'exited' || lower === 'dead';
        return lower === statusFilter;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.names.toLowerCase().includes(q) ||
        c.image.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q)
      );
    }

    if (sortMode === 'name') {
      filtered = [...filtered].sort((a, b) => a.names.localeCompare(b.names));
    } else if (sortMode === 'status') {
      filtered = [...filtered].sort((a, b) => a.state.localeCompare(b.state));
    }

    return filtered;
  }, [containers, statusFilter, searchQuery, sortMode]);

  const statusCounts = useMemo(() => {
    const counts = { running: 0, paused: 0, critical: 0 };
    for (const c of containers) {
      const lower = c.state.toLowerCase();
      if (lower === 'running') counts.running++;
      else if (lower === 'paused') counts.paused++;
      else if (lower === 'exited' || lower === 'dead') counts.critical++;
    }
    return counts;
  }, [containers]);

  const totalPages = Math.ceil(total / pageSize);

  const handleAction = useCallback(async (
    containerId: string,
    action: 'start' | 'stop' | 'restart' | 'remove' | 'pause' | 'unpause',
  ) => {
    setActionLoading(`${containerId}-${action}`);
    try {
      let result: ContainerActionResult;
      switch (action) {
        case 'start':
          result = await remoteConnectionAPI.startDockerContainer(sessionId, containerId);
          break;
        case 'stop':
          result = await remoteConnectionAPI.stopDockerContainer(sessionId, containerId);
          break;
        case 'restart':
          result = await remoteConnectionAPI.restartDockerContainer(sessionId, containerId);
          break;
        case 'remove':
          result = await remoteConnectionAPI.removeDockerContainer(sessionId, containerId);
          break;
        case 'pause':
          result = await remoteConnectionAPI.pauseDockerContainer(sessionId, containerId);
          break;
        case 'unpause':
          result = await remoteConnectionAPI.unpauseDockerContainer(sessionId, containerId);
          break;
      }
      if (result.success) {
        await fetchContainers();
        await fetchStats();
      }
    } catch {
      // Action failed
    } finally {
      setActionLoading(null);
    }
  }, [sessionId, fetchContainers, fetchStats]);

  const isActionLoading = (containerId: string, action: string) =>
    actionLoading === `${containerId}-${action}`;

  const handleInspect = useCallback(async (containerId: string) => {
    try {
      const detail = await remoteConnectionAPI.inspectDockerContainer(sessionId, containerId);
      setInspectModal(detail);
    } catch {
      // Inspect failed
    }
  }, [sessionId]);

  const handleCreateContainer = useCallback(async (request: CreateContainerRequest) => {
    try {
      await remoteConnectionAPI.createDockerContainer(sessionId, request);
      setShowCreate(false);
      await fetchContainers();
    } catch {
      // Create failed
    }
  }, [sessionId, fetchContainers]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-4">
        <div>
          <p
            className="uppercase tracking-[0.15em] font-semibold"
            style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
          >
            Infrastructure &rsaquo; Containers
          </p>
          <h1
            className="mt-1 font-bold"
            style={{ fontSize: '24px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            Running Instances
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-md font-semibold cursor-pointer flex items-center gap-1.5"
            style={{ fontSize: '12px', background: 'var(--color-primary)', color: '#fff' }}
          >
            <span
              className="material-symbols-rounded"
              style={{ fontSize: '16px', fontVariationSettings: "'FILL' 0, 'wght' 400" }}
            >
              add
            </span>
            Create Container
          </button>

          {/* Status counters */}
        <div
          className="flex items-center gap-6 px-5 py-2.5 rounded-md"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
        >
          <div className="text-center">
            <p className="font-bold" style={{ fontSize: '18px', color: '#4ade80' }}>
              {statusCounts.running}
            </p>
            <p
              className="uppercase tracking-[0.1em] font-semibold"
              style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}
            >
              Running
            </p>
          </div>
          <div className="text-center">
            <p className="font-bold" style={{ fontSize: '18px', color: '#facc15' }}>
              {statusCounts.paused}
            </p>
            <p
              className="uppercase tracking-[0.1em] font-semibold"
              style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}
            >
              Paused
            </p>
          </div>
          <div className="text-center">
            <p className="font-bold" style={{ fontSize: '18px', color: '#f87171' }}>
              {statusCounts.critical}
            </p>
            <p
              className="uppercase tracking-[0.1em] font-semibold"
              style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}
            >
              Critical
            </p>
          </div>
        </div>
        </div>
      </div>

      {/* Toolbar — filters + search */}
      <div className="flex items-center gap-3 px-6 pb-4">
        <div className="flex items-center gap-1">
          {(['all', 'running', 'stopped', 'exited'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => { setStatusFilter(f); setPage(0); }}
              className="px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-colors"
              style={{
                fontSize: '11px',
                background: statusFilter === f ? 'var(--color-primary)' : 'transparent',
                color: statusFilter === f ? '#fff' : 'var(--color-text-secondary)',
                border: statusFilter === f ? 'none' : '1px solid var(--color-border-muted)',
              }}
            >
              {f === 'all' ? 'All Groups' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-2">
          {(['latest', 'name', 'status'] as SortMode[]).map(s => (
            <button
              key={s}
              onClick={() => setSortMode(s)}
              className="px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-colors"
              style={{
                fontSize: '11px',
                background: sortMode === s ? 'var(--color-surface)' : 'transparent',
                color: sortMode === s ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                border: '1px solid var(--color-border-muted)',
              }}
            >
              <span
                className="material-symbols-rounded mr-1 align-middle"
                style={{ fontSize: '14px', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
              >
                {s === 'latest' ? 'schedule' : s === 'name' ? 'sort_by_alpha' : 'filter_list'}
              </span>
              {s === 'latest' ? 'Latest First' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="relative">
          <span
            className="material-symbols-rounded absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ fontSize: '16px', color: 'var(--color-text-muted)', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
          >
            search
          </span>
          <input
            type="text"
            placeholder="Filter by name, image, or status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-md w-60"
            style={{
              fontSize: '11px',
              background: 'var(--color-bg-base)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-muted)',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        <button
          onClick={() => { fetchContainers(); fetchStats(); }}
          className="p-1.5 rounded-md cursor-pointer transition-colors"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-muted)' }}
          title="Refresh"
        >
          <span
            className="material-symbols-rounded"
            style={{ fontSize: '18px', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
          >
            refresh
          </span>
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6">
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--color-border-muted)' }}
        >
          <table className="w-full border-collapse" style={{ fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface)' }}>
                {['Container Name', 'Image Source', 'Status', 'Ports / Network', 'Uptime', 'Actions'].map(h => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 font-semibold uppercase tracking-[0.1em]"
                    style={{ fontSize: '10px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border-muted)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className="w-5 h-5 border-2 rounded-full animate-spin"
                        style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Loading containers...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredContainers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <span
                        className="material-symbols-rounded"
                        style={{ fontSize: '32px', color: 'var(--color-text-muted)', fontVariationSettings: "'FILL' 0, 'wght' 200" }}
                      >
                        inventory_2
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {searchQuery || statusFilter !== 'all'
                          ? 'No containers match the current filter'
                          : 'No containers found on this host'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredContainers.map((c) => {
                const st = getStatusStyle(c.state);
                const containerStats = statsMap.get(c.id.substring(0, 12)) ?? statsMap.get(c.id);
                const isRunning = c.state.toLowerCase() === 'running';

                return (
                  <tr
                    key={c.id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--color-border-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,109,250,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Container Name */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: st.dot }}
                        />
                        <span
                          className="font-semibold"
                          style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}
                        >
                          {c.names.replace(/^\//, '')}
                        </span>
                      </div>
                    </td>

                    {/* Image */}
                    <td className="px-4 py-3.5">
                      <span
                        className="font-mono px-2 py-0.5 rounded"
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-text-secondary)',
                          background: 'var(--color-bg-base)',
                          border: '1px solid var(--color-border-muted)',
                        }}
                      >
                        {c.image}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold uppercase tracking-[0.08em]"
                        style={{ fontSize: '10px', color: st.text, background: st.bg }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                        {c.state}
                      </span>
                    </td>

                    {/* Ports */}
                    <td className="px-4 py-3.5">
                      <span
                        className="font-mono"
                        style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}
                      >
                        {c.ports || '-'}
                      </span>
                    </td>

                    {/* Uptime */}
                    <td className="px-4 py-3.5">
                      <span
                        className="font-mono"
                        style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}
                      >
                        {formatUptime(c.status)}
                      </span>
                      {containerStats && (
                        <span
                          className="font-mono ml-2"
                          style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
                        >
                          CPU {containerStats.cpuPercent}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        {isRunning ? (
                          <>
                            <ActionButton
                              icon="stop"
                              title="Stop"
                              loading={isActionLoading(c.id, 'stop')}
                              onClick={() => handleAction(c.id, 'stop')}
                            />
                            {c.state.toLowerCase() === 'paused' ? (
                              <ActionButton
                                icon="play_arrow"
                                title="Unpause"
                                loading={isActionLoading(c.id, 'unpause')}
                                onClick={() => handleAction(c.id, 'unpause')}
                              />
                            ) : (
                              <ActionButton
                                icon="pause"
                                title="Pause"
                                loading={isActionLoading(c.id, 'pause')}
                                onClick={() => handleAction(c.id, 'pause')}
                              />
                            )}
                          </>
                        ) : (
                          <ActionButton
                            icon="play_arrow"
                            title="Start"
                            loading={isActionLoading(c.id, 'start')}
                            onClick={() => handleAction(c.id, 'start')}
                          />
                        )}
                        <ActionButton
                          icon="restart_alt"
                          title="Restart"
                          loading={isActionLoading(c.id, 'restart')}
                          onClick={() => handleAction(c.id, 'restart')}
                        />
                        <ActionButton
                          icon="info"
                          title="Inspect"
                          loading={false}
                          onClick={() => handleInspect(c.id)}
                        />
                        {isRunning && (
                          <ActionButton
                            icon="terminal"
                            title="Exec"
                            loading={false}
                            onClick={() => setExecModal({ containerId: c.id, name: c.names.replace(/^\//, '') })}
                          />
                        )}
                        <LogsButton sessionId={sessionId} containerId={c.id} containerName={c.names} />
                        <ActionButton
                          icon="delete"
                          title="Remove"
                          loading={isActionLoading(c.id, 'remove')}
                          onClick={() => handleAction(c.id, 'remove')}
                          destructive
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pb-4">
            <p
              className="uppercase tracking-[0.1em] font-semibold"
              style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
            >
              Showing {filteredContainers.length} of {total} containers
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="w-7 h-7 rounded flex items-center justify-center cursor-pointer disabled:opacity-30"
                style={{ border: '1px solid var(--color-border-muted)', color: 'var(--color-text-secondary)' }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>chevron_left</span>
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pageNum = page < 3 ? i : page - 2 + i;
                if (pageNum >= totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className="w-7 h-7 rounded flex items-center justify-center cursor-pointer font-semibold"
                    style={{
                      fontSize: '11px',
                      background: page === pageNum ? 'var(--color-primary)' : 'transparent',
                      color: page === pageNum ? '#fff' : 'var(--color-text-secondary)',
                      border: page === pageNum ? 'none' : '1px solid var(--color-border-muted)',
                    }}
                  >
                    {pageNum + 1}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="w-7 h-7 rounded flex items-center justify-center cursor-pointer disabled:opacity-30"
                style={{ border: '1px solid var(--color-border-muted)', color: 'var(--color-text-secondary)' }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom stats bar */}
      {stats.length > 0 && (
        <BottomStatsBar stats={stats} />
      )}

      {/* Create Container Modal */}
      {showCreate && (
        <CreateContainerModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateContainer}
        />
      )}

      {/* Inspect Modal */}
      {inspectModal && (
        <InspectModal
          detail={inspectModal}
          onClose={() => setInspectModal(null)}
        />
      )}

      {/* Exec Modal */}
      {execModal && (
        <ExecModal
          sessionId={sessionId}
          containerId={execModal.containerId}
          containerName={execModal.name}
          onClose={() => setExecModal(null)}
        />
      )}
    </div>
  );
}

// Sub-components

function ActionButton({
  icon,
  title,
  loading,
  onClick,
  destructive = false,
}: {
  icon: string;
  title: string;
  loading: boolean;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      className="w-7 h-7 rounded flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40"
      style={{
        color: destructive ? '#f87171' : 'var(--color-text-muted)',
        background: 'transparent',
        border: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = destructive
          ? 'rgba(248,113,113,0.1)'
          : 'rgba(124,109,250,0.08)';
        e.currentTarget.style.color = destructive ? '#f87171' : 'var(--color-primary)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = destructive ? '#f87171' : 'var(--color-text-muted)';
      }}
    >
      {loading ? (
        <div
          className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
        />
      ) : (
        <span
          className="material-symbols-rounded"
          style={{ fontSize: '16px', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
        >
          {icon}
        </span>
      )}
    </button>
  );
}

function LogsButton({
  sessionId,
  containerId,
  containerName,
}: {
  sessionId: string;
  containerId: string;
  containerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [logsLines, setLogsLines] = useState<string[]>([]);
  const [streamState, setStreamState] = useState<'idle' | 'connecting' | 'live' | 'done' | 'error'>('idle');
  const streamStopRef = useRef<(() => void) | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const startStream = useCallback(async () => {
    if (streamStopRef.current) {
      streamStopRef.current();
      streamStopRef.current = null;
    }
    setLogsLines([]);
    setStreamState('connecting');

    const stop = await remoteConnectionAPI.streamDockerContainerLogs(
      sessionId,
      containerId,
      200,
      true,
      (line) => setLogsLines(prev => [...prev, line]),
      () => setStreamState('done'),
      () => setStreamState('error'),
    );
    streamStopRef.current = stop;
    setStreamState('live');
  }, [sessionId, containerId]);

  useEffect(() => {
    if (open) startStream();
    return () => {
      if (streamStopRef.current) {
        streamStopRef.current();
        streamStopRef.current = null;
      }
    };
  }, [open, startStream]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logsLines]);

  const handleClose = useCallback(() => {
    if (streamStopRef.current) {
      streamStopRef.current();
      streamStopRef.current = null;
    }
    setOpen(false);
    setLogsLines([]);
    setStreamState('idle');
  }, []);

  if (!open) {
    return (
      <ActionButton
        icon="description"
        title="Logs"
        loading={false}
        onClick={() => setOpen(true)}
      />
    );
  }

  const stateLabel = streamState === 'live' ? 'LIVE' : streamState === 'connecting' ? 'CONNECTING' : streamState === 'done' ? 'ENDED' : streamState === 'error' ? 'ERROR' : '';
  const stateColor = streamState === 'live' ? '#4ade80' : streamState === 'error' ? '#f87171' : '#facc15';

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={handleClose}
      />
      <div
        className="fixed inset-8 z-50 flex flex-col rounded-lg overflow-hidden"
        style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border-muted)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid var(--color-border-muted)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-rounded"
              style={{ fontSize: '18px', color: 'var(--color-primary)', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
            >
              description
            </span>
            <span
              className="font-semibold"
              style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}
            >
              Logs — {containerName.replace(/^\//, '')}
            </span>
            {stateLabel && (
              <span
                className="ml-2 px-2 py-0.5 rounded-full font-semibold uppercase tracking-[0.08em]"
                style={{ fontSize: '9px', color: stateColor, background: `${stateColor}15` }}
              >
                {stateLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startStream}
              className="p-1 rounded cursor-pointer"
              style={{ color: 'var(--color-text-muted)' }}
              title="Restart stream"
            >
              <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>refresh</span>
            </button>
            <button
              onClick={handleClose}
              className="p-1 rounded cursor-pointer"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>close</span>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {streamState === 'connecting' ? (
            <div className="flex items-center justify-center h-full">
              <div
                className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
              />
            </div>
          ) : logsLines.length === 0 ? (
            <span
              className="font-mono"
              style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}
            >
              No logs available.
            </span>
          ) : (
            <pre
              className="font-mono whitespace-pre-wrap"
              style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}
            >
              {logsLines.join('\n')}
            </pre>
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </>
  );
}

function BottomStatsBar({ stats }: { stats: DockerContainerStats[] }) {
  const aggregated = useMemo(() => {
    let totalCpu = 0;
    let totalMemUsage = 0;
    let totalMemLimit = 0;

    for (const s of stats) {
      const cpu = parseFloat(s.cpuPercent?.replace('%', '') ?? '0');
      if (!isNaN(cpu)) totalCpu += cpu;

      const memParts = s.memoryUsage?.split('/');
      if (memParts && memParts.length === 2) {
        totalMemUsage += parseMemValue(memParts[0].trim());
        totalMemLimit += parseMemValue(memParts[1].trim());
      }
    }

    return {
      cpuPercent: totalCpu.toFixed(1),
      memUsed: formatBytes(totalMemUsage),
      memTotal: formatBytes(totalMemLimit),
      memPercent: totalMemLimit > 0 ? ((totalMemUsage / totalMemLimit) * 100).toFixed(0) : '0',
    };
  }, [stats]);

  return (
    <div
      className="flex items-stretch gap-px px-6 py-0"
      style={{ borderTop: '1px solid var(--color-border-muted)' }}
    >
      <StatCard
        label="CPU Usage"
        value={`${aggregated.cpuPercent}%`}
        subtext={`Total consumption across ${stats.length} containers`}
        percent={parseFloat(aggregated.cpuPercent)}
        color="#7C6DFA"
      />
      <StatCard
        label="Memory Allocation"
        value={aggregated.memUsed}
        subtext={`${aggregated.memPercent}% of ${aggregated.memTotal} reserved`}
        percent={parseFloat(aggregated.memPercent)}
        color="#66d9cc"
      />
      <StatCard
        label="Active Containers"
        value={String(stats.length)}
        subtext="Currently running"
        percent={-1}
        color="#4ade80"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  percent,
  color,
}: {
  label: string;
  value: string;
  subtext: string;
  percent: number;
  color: string;
}) {
  return (
    <div
      className="flex-1 px-5 py-4"
      style={{ borderRight: '1px solid var(--color-border-muted)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="uppercase tracking-[0.1em] font-semibold"
          style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}
        >
          {label}
        </span>
        <span className="font-bold font-mono" style={{ fontSize: '14px', color }}>
          {value}
        </span>
      </div>
      {percent >= 0 && (
        <div
          className="w-full h-1 rounded-full mb-2"
          style={{ background: 'var(--color-bg-base)' }}
        >
          <div
            className="h-1 rounded-full transition-all"
            style={{ width: `${Math.min(percent, 100)}%`, background: color }}
          />
        </div>
      )}
      <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{subtext}</span>
    </div>
  );
}

// Utility functions

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
