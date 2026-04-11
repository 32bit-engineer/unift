/**
 * Docker Logs — Aggregated container log viewer with container selector,
 * streaming/static mode, search, and configurable tail. Supports SSE
 * live tailing via streamDockerContainerLogs and static fetch via
 * getDockerContainerLogs.
 *
 * Data source: remoteConnectionAPI.listDockerContainers,
 *              remoteConnectionAPI.getDockerContainerLogs,
 *              remoteConnectionAPI.streamDockerContainerLogs
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import { Input } from '@/components/ui/input';
import type { DockerContainer } from '@/utils/remoteConnectionAPI';

interface DockerLogsPageProps {
  sessionId: string;
}

const DEFAULT_TAIL = 100;

function LogToolbar({
  containers,
  selectedId,
  onSelectContainer,
  tail,
  onTailChange,
  timestamps,
  onTimestampsToggle,
  streaming,
  onStreamToggle,
  searchQuery,
  onSearchChange,
  onCopy,
  onClear,
  loading,
}: {
  containers: DockerContainer[];
  selectedId: string;
  onSelectContainer: (id: string) => void;
  tail: number;
  onTailChange: (t: number) => void;
  timestamps: boolean;
  onTimestampsToggle: () => void;
  streaming: boolean;
  onStreamToggle: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onCopy: () => void;
  onClear: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: Container selector + tail + timestamps */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedId}
          onChange={e => onSelectContainer(e.target.value)}
          className="rounded-md px-2 py-1.5 text-xs cursor-pointer"
          style={{
            background: 'var(--color-surface)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-muted)',
            outline: 'none',
            minWidth: 180,
          }}
        >
          <option value="">Select container...</option>
          {containers.map(c => (
            <option key={c.id} value={c.id}>{c.names} ({c.state})</option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Tail:</span>
          <Input
            type="number"
            value={tail}
            onChange={e => onTailChange(Math.max(1, parseInt(e.target.value) || DEFAULT_TAIL))}
            className="w-16 h-7 px-2 text-xs"
            min={1}
            max={10000}
          />
        </div>

        <button
          onClick={onTimestampsToggle}
          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs cursor-pointer"
          style={{
            background: timestamps ? 'var(--color-primary)' : 'var(--color-surface)',
            color: timestamps ? '#fff' : 'var(--color-text-secondary)',
            border: `1px solid ${timestamps ? 'var(--color-primary)' : 'var(--color-border-muted)'}`,
          }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 14 }}>schedule</span>
          Timestamps
        </button>

        <button
          onClick={onStreamToggle}
          disabled={!selectedId || loading}
          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: streaming ? '#f87171' : 'var(--color-primary)',
            color: '#fff',
            border: 'none',
          }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 14 }}>
            {streaming ? 'stop' : 'play_arrow'}
          </span>
          {streaming ? 'Stop' : 'Stream'}
        </button>
      </div>

      {/* Row 2: Search + actions */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <span
            className="material-symbols-rounded absolute left-2 top-1/2 -translate-y-1/2"
            style={{ fontSize: 14, color: 'var(--color-text-muted)' }}
          >
            search
          </span>
          <Input
            type="text"
            placeholder="Filter log lines..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-7 h-7 text-xs"
          />
        </div>
        <button
          onClick={onCopy}
          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs cursor-pointer"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-muted)' }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 14 }}>content_copy</span>
          Copy
        </button>
        <button
          onClick={onClear}
          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs cursor-pointer"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-muted)' }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 14 }}>delete_sweep</span>
          Clear
        </button>
      </div>
    </div>
  );
}

function LogDisplay({ lines, searchQuery }: { lines: string[]; searchQuery: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  const filtered = searchQuery
    ? lines.filter(l => l.toLowerCase().includes(searchQuery.toLowerCase()))
    : lines;

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {searchQuery ? 'No matching log lines' : 'No logs to display'}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-auto rounded-md p-3"
      style={{
        background: '#0d0d0d',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 11,
        lineHeight: 1.6,
      }}
    >
      {filtered.map((line, i) => (
        <div key={i} className="whitespace-pre-wrap break-all" style={{ color: '#d4d4d8' }}>
          <span className="select-none mr-3" style={{ color: '#525252' }}>{String(i + 1).padStart(4)}</span>
          {line}
        </div>
      ))}
    </div>
  );
}

export function DockerLogsPage({ sessionId }: DockerLogsPageProps) {
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tail, setTail] = useState(DEFAULT_TAIL);
  const [timestamps, setTimestamps] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const stopStreamRef = useRef<(() => void) | null>(null);

  const fetchContainers = useCallback(async () => {
    try {
      const res = await remoteConnectionAPI.listDockerContainers(sessionId, true, 0, 200);
      setContainers(res.containers);
    } catch {
      setError('Failed to load container list.');
    } finally {
      setInitLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchContainers();
  }, [fetchContainers]);

  const stopStreaming = useCallback(() => {
    if (stopStreamRef.current) {
      stopStreamRef.current();
      stopStreamRef.current = null;
    }
    setStreaming(false);
  }, []);

  useEffect(() => {
    return () => { stopStreaming(); };
  }, [stopStreaming]);

  const fetchStaticLogs = useCallback(async (containerId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await remoteConnectionAPI.getDockerContainerLogs(sessionId, containerId, tail);
      const lines = (res.logs ?? '').split('\n').filter(Boolean);
      setLogLines(lines);
    } catch {
      setError('Failed to fetch container logs.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, tail]);

  const handleSelectContainer = useCallback((id: string) => {
    stopStreaming();
    setSelectedId(id);
    setLogLines([]);
    setError(null);
  }, [stopStreaming]);

  useEffect(() => {
    if (!selectedId || streaming) return;
    fetchStaticLogs(selectedId);
  }, [selectedId, tail, streaming, fetchStaticLogs]);

  const handleStreamToggle = useCallback(async () => {
    if (streaming) {
      stopStreaming();
      return;
    }
    if (!selectedId) return;

    setStreaming(true);
    setLogLines([]);
    setError(null);

    try {
      const stop = await remoteConnectionAPI.streamDockerContainerLogs(
        sessionId,
        selectedId,
        tail,
        timestamps,
        (line) => { setLogLines(prev => [...prev, line]); },
        () => { setStreaming(false); },
        (err) => { setError(err); setStreaming(false); },
      );
      stopStreamRef.current = stop;
    } catch {
      setError('Failed to start log stream.');
      setStreaming(false);
    }
  }, [streaming, selectedId, sessionId, tail, timestamps, stopStreaming]);

  const handleCopy = useCallback(async () => {
    const text = logLines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard write failed
    }
  }, [logLines]);

  const handleClear = useCallback(() => {
    setLogLines([]);
  }, []);

  if (initLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading containers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h1 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Docker Logs</h1>
        {streaming && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs" style={{ color: '#f87171' }}>Streaming</span>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="px-6 pb-3">
        <LogToolbar
          containers={containers}
          selectedId={selectedId}
          onSelectContainer={handleSelectContainer}
          tail={tail}
          onTailChange={setTail}
          timestamps={timestamps}
          onTimestampsToggle={() => setTimestamps(prev => !prev)}
          streaming={streaming}
          onStreamToggle={handleStreamToggle}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onCopy={handleCopy}
          onClear={handleClear}
          loading={loading}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 pb-2">
          <div className="rounded-md px-3 py-2 text-xs" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
            {error}
          </div>
        </div>
      )}

      {/* Log Display */}
      <div className="flex-1 px-6 pb-6 min-h-0 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
              />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Fetching logs...</span>
            </div>
          </div>
        ) : !selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <span className="material-symbols-rounded" style={{ fontSize: 36, color: 'var(--color-text-muted)' }}>description</span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Select a container to view logs</span>
            </div>
          </div>
        ) : (
          <LogDisplay lines={logLines} searchQuery={searchQuery} />
        )}
      </div>
    </div>
  );
}
