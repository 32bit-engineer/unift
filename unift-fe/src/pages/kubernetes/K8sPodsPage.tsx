/**
 * Kubernetes Pods List — Workload pods table with namespace and status
 * filtering, pagination, per-pod logs modal, and delete action.
 *
 * Design reference: designs/unift/k8s_pods_list/screen.png
 *
 * Data source: K8sController.listPods, getPodLogs, deletePod
 * via remoteConnectionAPI
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { K8sPod, K8sNamespace } from '@/utils/remoteConnectionAPI';
import { K8sYamlModal } from './K8sYamlModal';
import type { YamlModalTarget } from './K8sYamlModal';

interface K8sPodsPageProps {
  sessionId: string;
}

const PAGE_SIZE = 10;

export function K8sPodsPage({ sessionId }: K8sPodsPageProps) {
  const [pods, setPods] = useState<K8sPod[]>([]);
  const [total, setTotal] = useState(0);
  const [namespaces, setNamespaces] = useState<K8sNamespace[]>([]);
  const [selectedNs, setSelectedNs] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [logsModal, setLogsModal] = useState<{ podName: string; namespace: string } | null>(null);
  const [logsLines, setLogsLines] = useState<string[]>([]);
  const [streamState, setStreamState] = useState<'idle' | 'connecting' | 'live' | 'done' | 'error'>('idle');
  const streamStopRef = useRef<(() => void) | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [yamlModal, setYamlModal] = useState<YamlModalTarget | null>(null);

  const fetchNamespaces = useCallback(async () => {
    try {
      const nsList = await remoteConnectionAPI.listK8sNamespaces(sessionId);
      setNamespaces(nsList);
    } catch {
      // silently fall back — ns dropdown just stays empty
    }
  }, [sessionId]);

  const fetchPods = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await remoteConnectionAPI.listK8sPods(sessionId, selectedNs);
      setPods(res.pods);
      setTotal(res.total);
    } catch {
      setError('Failed to load pods. kubectl may not be available on this host.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedNs]);

  useEffect(() => {
    fetchNamespaces();
  }, [fetchNamespaces]);

  useEffect(() => {
    fetchPods();
    setPage(1);
  }, [fetchPods]);

  // Auto-scroll to the latest log line whenever new lines arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logsLines]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return pods;
    return pods.filter((p) => p.status.toLowerCase() === statusFilter);
  }, [pods, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const counts = useMemo(() => {
    const running = pods.filter((p) => p.status.toLowerCase() === 'running').length;
    const failed = pods.filter((p) => p.status.toLowerCase() === 'failed' || p.status.toLowerCase().includes('crash')).length;
    return { running, failed };
  }, [pods]);

  const handleViewLogs = useCallback(async (podName: string, namespace: string) => {
    // Stop any existing stream before opening a new one
    if (streamStopRef.current) {
      streamStopRef.current();
      streamStopRef.current = null;
    }
    setLogsLines([]);
    setStreamState('connecting');
    setLogsModal({ podName, namespace });

    const stop = await remoteConnectionAPI.streamK8sPodLogs(
      sessionId,
      podName,
      namespace,
      200,
      (line) => setLogsLines((prev) => [...prev, line]),
      () => setStreamState('done'),
      () => setStreamState('error'),
    );
    streamStopRef.current = stop;
    setStreamState('live');
  }, [sessionId]);

  const handleDelete = async (podName: string, namespace: string) => {
    const key = `${namespace}/${podName}`;
    setActionLoading(key);
    try {
      await remoteConnectionAPI.deleteK8sPod(sessionId, podName, namespace);
      await fetchPods();
    } catch {
      // silent — UI will show stale state until next refresh
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogsClose = useCallback(() => {
    if (streamStopRef.current) {
      streamStopRef.current();
      streamStopRef.current = null;
    }
    setLogsModal(null);
    setLogsLines([]);
    setStreamState('idle');
  }, []);

  if (loading && pods.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        <span className="material-symbols-rounded" style={{ fontSize: 28, marginRight: 10, animation: 'spin 1s linear infinite' }}>progress_activity</span>
        Loading pods...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <span className="material-symbols-rounded" style={{ fontSize: 40, color: '#f87171' }}>error</span>
        <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>
        <button onClick={fetchPods} style={{ padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'auto', height: '100%' }}>
      {/* Header */}
      <div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px', letterSpacing: 0.5 }}>RESOURCES &gt; PODS</p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Workload Pods</h2>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Namespace select */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
          background: 'var(--bg-card, #1b1b23)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>NAMESPACE:</span>
          <select
            value={selectedNs}
            onChange={(e) => setSelectedNs(e.target.value)}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-primary)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">All</option>
            {namespaces.map((ns) => (
              <option key={ns.name} value={ns.name}>{ns.name}</option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
          background: 'var(--bg-card, #1b1b23)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>STATUS:</span>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-primary)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="all">All Statuses</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="succeeded">Succeeded</option>
          </select>
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Showing {filtered.length} pods of {total} active
        </span>
        <button
          onClick={fetchPods}
          style={{ display: 'flex', alignItems: 'center', padding: 6, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 6 }}
          title="Refresh"
        >
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>refresh</span>
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['POD NAME', 'NAMESPACE', 'STATUS', 'NODE', 'RESTARTS', 'AGE', 'ACTIONS'].map((h) => (
                <th key={h} style={{
                  padding: '12px 14px', fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
                  color: 'var(--text-secondary)', textAlign: 'left', textTransform: 'uppercase',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((pod) => {
              const key = `${pod.namespace}/${pod.name}`;
              const isActing = actionLoading === key;
              return (
                <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: pod.status === 'Running' ? '#4ade80'
                          : pod.status === 'Pending' ? '#facc15'
                          : pod.status.toLowerCase().includes('crash') ? '#f87171'
                          : '#6b7280',
                      }} />
                      {pod.name}
                    </div>
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{pod.namespace}</td>
                  <td style={{ padding: '14px' }}>
                    <StatusPill status={pod.status} />
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{pod.nodeName}</td>
                  <td style={{
                    padding: '14px', fontSize: 13,
                    color: pod.restarts > 5 ? '#f87171' : pod.restarts > 0 ? '#facc15' : 'var(--text-secondary)',
                    fontWeight: pod.restarts > 0 ? 600 : 400,
                  }}>
                    {pod.restarts}
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{pod.age}</td>
                  <td style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ViewLogsBtn
                        loading={streamState === 'connecting' && logsModal?.podName === pod.name}
                        onClick={() => handleViewLogs(pod.name, pod.namespace)}
                      />
                      <ActionBtn
                        icon="edit_note"
                        title="Edit YAML"
                        onClick={() => setYamlModal({ kind: 'Pod', namespace: pod.namespace, name: pod.name })}
                      />
                      <ActionBtn icon="info" title="Pod Info" onClick={() => {}} />
                      <ActionBtn
                        icon="delete"
                        title="Delete Pod"
                        loading={isActing}
                        danger
                        onClick={() => handleDelete(pod.name, pod.namespace)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No pods found with current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Page <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> of {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <PageBtn label="chevron_left" disabled={page <= 1} onClick={() => setPage(page - 1)} />
            <PageBtn label="chevron_right" disabled={page >= totalPages} onClick={() => setPage(page + 1)} />
          </div>
        </div>
      </div>

      {/* Bottom stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <BottomStatCard
          label="HEALTHY PODS"
          value={counts.running}
          accent="#4ade80"
        />
        <BottomStatCard
          label="FAILURES"
          value={counts.failed}
          accent="#f87171"
          sub={counts.failed > 0 ? 'Investigate logs' : undefined}
        />
        <BottomStatCard label="TOTAL RESTARTS" value={pods.reduce((s, p) => s + p.restarts, 0)} accent="var(--text-secondary)" />
        <BottomStatCard label="NAMESPACES" value={namespaces.length} accent="var(--primary, #7C6DFA)" />
      </div>

      {/* Logs Modal */}
      {logsModal && (
        <>
          <div
            onClick={handleLogsClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, backdropFilter: 'blur(2px)' }}
          />
          <div style={{
            position: 'fixed', top: '4%', left: '6%', right: '6%', bottom: '4%',
            background: '#0B0B14', borderRadius: 14, zIndex: 1001,
            display: 'flex', flexDirection: 'column',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.75)',
          }}>
            {/* Modal header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(124,109,250,0.12)', border: '1px solid rgba(124,109,250,0.2)', flexShrink: 0,
                }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 16, color: '#7C6DFA', fontVariationSettings: "'FILL' 0, 'wght' 300" }}>
                    description
                  </span>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {logsModal.podName}
                    </h3>
                    {/* Streaming state badge */}
                    {streamState === 'connecting' && (
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, padding: '2px 7px', borderRadius: 4, background: 'rgba(250,204,21,0.12)', color: '#facc15' }}>CONNECTING</span>
                    )}
                    {streamState === 'live' && (
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, padding: '2px 7px', borderRadius: 4, background: 'rgba(74,222,128,0.12)', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.4s ease-in-out infinite' }} />
                        LIVE
                      </span>
                    )}
                    {streamState === 'done' && (
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, padding: '2px 7px', borderRadius: 4, background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>DONE</span>
                    )}
                    {streamState === 'error' && (
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, padding: '2px 7px', borderRadius: 4, background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>ERROR</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>namespace: {logsModal.namespace}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => navigator.clipboard.writeText(logsLines.join('\n'))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 13, fontVariationSettings: "'FILL' 0, 'wght' 300" }}>content_copy</span>
                  Copy All
                </button>
                <button
                  onClick={handleLogsClose}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 6, borderRadius: 6 }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
                </button>
              </div>
            </div>

            {/* Log level legend + line count */}
            <LogLevelLegend lines={logsLines} />

            {/* Scrollable log lines */}
            <div style={{
              flex: 1, overflowY: 'auto', overflowX: 'hidden',
              paddingTop: 6, paddingBottom: 12,
            }}>
              {logsLines
                .filter(Boolean)
                .map((line, i) => (
                  <LogLine key={i} line={line} index={i} />
                ))}
              {logsLines.length === 0 && streamState === 'connecting' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, gap: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                  Connecting to log stream…
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </>
      )}

      {/* YAML Editor Modal */}
      {yamlModal && (
        <K8sYamlModal
          sessionId={sessionId}
          target={yamlModal}
          onClose={() => setYamlModal(null)}
        />
      )}
    </div>
  );
}

// Log level detection — matches common log format keywords
function getLogLevel(line: string): 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'default' {
  const u = line.toUpperCase();
  if (/\b(FATAL|CRITICAL|CRIT|EMERG|ALERT|PANIC)\b/.test(u)) return 'fatal';
  if (/\b(ERROR|ERR|EXCEPTION|SEVERE|FAIL|FAILED)\b/.test(u)) return 'error';
  if (/\b(WARN|WARNING)\b/.test(u)) return 'warn';
  if (/\b(INFO|NOTICE|SUCCESS)\b/.test(u)) return 'info';
  if (/\b(DEBUG|DBG|TRACE|VERBOSE)\b/.test(u)) return 'debug';
  return 'default';
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  fatal:   '#f87171',
  error:   '#f87171',
  warn:    '#facc15',
  info:    '#4ade80',
  debug:   '#fb923c',
  default: '#7a8299',
};

// Single scrollable log line — single-line truncated, color-coded, hover reveals full text + copy
function LogLine({ line, index }: { line: string; index: number }) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const level = getLogLevel(line);
  const color = LOG_LEVEL_COLORS[level];

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(line).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '2px 16px',
        background: hovered ? 'rgba(255,255,255,0.025)' : 'transparent',
        transition: 'background 0.08s',
        minHeight: 24,
      }}
    >
      {/* Line number */}
      <span style={{
        fontSize: 10, color: '#2a3040', minWidth: 36, textAlign: 'right',
        userSelect: 'none', fontFamily: "'DM Mono', monospace", flexShrink: 0,
      }}>
        {index + 1}
      </span>

      {/* Level badge */}
      {level !== 'default' && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
          color, flexShrink: 0, minWidth: 38, textTransform: 'uppercase',
          opacity: 0.85,
        }}>
          {level === 'fatal' ? 'FATAL' : level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : level === 'info' ? 'INFO' : 'DEBUG'}
        </span>
      )}

      {/* Log text — single line, truncated, native tooltip shows full content */}
      <span
        title={line}
        style={{
          flex: 1, fontSize: 12, fontFamily: "'DM Mono', monospace",
          color, lineHeight: '20px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          cursor: 'default',
        }}
      >
        {line}
      </span>

      {/* Copy button — appears on hover */}
      <button
        onClick={handleCopy}
        style={{
          flexShrink: 0, visibility: hovered ? 'visible' : 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 4,
          background: 'rgba(255,255,255,0.06)', border: 'none',
          cursor: 'pointer',
          color: copied ? '#4ade80' : '#5a6380',
          transition: 'color 0.15s',
        }}
        title="Copy line"
      >
        <span
          className="material-symbols-rounded"
          style={{ fontSize: 12, fontVariationSettings: "'FILL' 0, 'wght' 300" }}
        >
          {copied ? 'check' : 'content_copy'}
        </span>
      </button>
    </div>
  );
}

// Summary bar showing level distribution and total line count
function LogLevelLegend({ lines }: { lines: string[] }) {
  const cleanLines = lines.filter(Boolean);
  const counts: Record<string, number> = { fatal: 0, error: 0, warn: 0, info: 0, debug: 0, default: 0 };
  cleanLines.forEach(l => { counts[getLogLevel(l)]++; });

  const entries = [
    { key: 'error', label: 'ERROR', color: '#f87171', count: counts.fatal + counts.error },
    { key: 'warn',  label: 'WARN',  color: '#facc15', count: counts.warn },
    { key: 'info',  label: 'INFO',  color: '#4ade80', count: counts.info },
    { key: 'debug', label: 'DEBUG', color: '#fb923c', count: counts.debug },
  ].filter(e => e.count > 0);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '6px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)',
      flexShrink: 0, background: 'rgba(0,0,0,0.2)',
    }}>
      {entries.map(e => (
        <span key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: e.color, flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: e.color, letterSpacing: 0.5 }}>{e.label}</span>
          <span style={{ fontSize: 10, color: '#3a4058' }}>{e.count}</span>
        </span>
      ))}
      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#3a4058' }}>
        {cleanLines.length} lines
      </span>
    </div>
  );
}

// Labeled "View Logs" button — replaces the plain terminal icon in the actions column
function ViewLogsBtn({ loading, onClick }: { loading?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title="View Logs"
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 6, border: 'none',
        cursor: loading ? 'wait' : 'pointer',
        background: 'rgba(124,109,250,0.1)',
        color: '#7C6DFA',
        fontSize: 11, fontWeight: 600,
        transition: 'background 0.15s', whiteSpace: 'nowrap',
      }}
    >
      <span
        className="material-symbols-rounded"
        style={{
          fontSize: 14,
          animation: loading ? 'spin 1s linear infinite' : undefined,
          fontVariationSettings: "'FILL' 0, 'wght' 300",
        }}
      >
        {loading ? 'progress_activity' : 'description'}
      </span>
      View Logs
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const lower = status.toLowerCase();
  const color = lower === 'running' ? '#4ade80'
    : lower === 'pending' ? '#facc15'
    : lower.includes('crash') ? '#f87171'
    : lower === 'succeeded' ? '#60a5fa'
    : '#6b7280';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
      borderRadius: 6, fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
      background: `${color}18`, color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
      {status}
    </span>
  );
}

function ActionBtn({ icon, title, onClick, loading, danger }: {
  icon: string; title: string; onClick: () => void; loading?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: 6, border: 'none', cursor: loading ? 'wait' : 'pointer',
        background: danger ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.04)',
        color: danger ? '#f87171' : 'var(--text-secondary)',
        transition: 'background 0.15s',
      }}
    >
      <span className="material-symbols-rounded" style={{
        fontSize: 17,
        animation: loading ? 'spin 1s linear infinite' : undefined,
      }}>
        {loading ? 'progress_activity' : icon}
      </span>
    </button>
  );
}

function PageBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-card, #1b1b23)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8, color: disabled ? 'rgba(255,255,255,0.15)' : 'var(--text-primary)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span className="material-symbols-rounded" style={{ fontSize: 20 }}>{label}</span>
    </button>
  );
}

function BottomStatCard({ label, value, accent, sub }: { label: string; value: number; accent: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--bg-card, #1b1b23)', borderRadius: 10, padding: '16px 20px',
      borderLeft: `3px solid ${accent}`,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{value}</div>
      {sub && <span style={{ fontSize: 11, color: accent }}>{sub}</span>}
    </div>
  );
}
