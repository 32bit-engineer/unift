/**
 * Kubernetes DaemonSets — table listing cluster DaemonSets with per-node
 * scheduling status (desired/current/ready/up-to-date/available) and restart action.
 *
 * Data source: K8sController.listDaemonSets, restartDaemonSet via remoteConnectionAPI
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { K8sDaemonSet, K8sNamespace } from '@/utils/remoteConnectionAPI';
import { K8sYamlModal } from './K8sYamlModal';
import type { YamlModalTarget } from './K8sYamlModal';

interface K8sDaemonSetsPageProps {
  sessionId: string;
}

const PAGE_SIZE = 10;

export function K8sDaemonSetsPage({ sessionId }: K8sDaemonSetsPageProps) {
  const [daemonSets, setDaemonSets] = useState<K8sDaemonSet[]>([]);
  const [total, setTotal] = useState(0);
  const [namespaces, setNamespaces] = useState<K8sNamespace[]>([]);
  const [selectedNs, setSelectedNs] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [yamlModal, setYamlModal] = useState<YamlModalTarget | null>(null);

  const fetchNamespaces = useCallback(async () => {
    try {
      const nsList = await remoteConnectionAPI.listK8sNamespaces(sessionId);
      setNamespaces(nsList);
    } catch { /* silent */ }
  }, [sessionId]);

  const fetchDaemonSets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await remoteConnectionAPI.listK8sDaemonSets(sessionId, selectedNs);
      setDaemonSets(res.daemonSets);
      setTotal(res.total);
    } catch {
      setError('Failed to load DaemonSets.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedNs]);

  useEffect(() => { fetchNamespaces(); }, [fetchNamespaces]);
  useEffect(() => { fetchDaemonSets(); setPage(1); }, [fetchDaemonSets]);

  const stats = useMemo(() => {
    const healthy = daemonSets.filter(d => d.ready === d.desired && d.desired > 0).length;
    const degraded = daemonSets.filter(d => d.ready < d.desired).length;
    return { healthy, degraded };
  }, [daemonSets]);

  const totalPages = Math.max(1, Math.ceil(daemonSets.length / PAGE_SIZE));
  const paginated = useMemo(() => daemonSets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [daemonSets, page]);

  const handleRestart = async (name: string, namespace: string) => {
    const key = `${namespace}/${name}`;
    setActionLoading(key);
    try {
      await remoteConnectionAPI.restartK8sDaemonSet(sessionId, name, namespace);
      await fetchDaemonSets();
    } catch { /* silent */ } finally {
      setActionLoading(null);
    }
  };

  if (loading && daemonSets.length === 0) {
    return (
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="shimmer" style={{ height: 11, width: 180, borderRadius: 4, marginBottom: 8 }} />
          <div className="shimmer" style={{ height: 26, width: 140, borderRadius: 6 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="shimmer" style={{ height: 36, width: 150, borderRadius: 7 }} />
        </div>
        <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[140, 100, 60, 60, 55, 80, 80, 55, 70].map((w, i) => (
                  <th key={i} style={{ padding: '12px 14px' }}>
                    <div className="shimmer" style={{ height: 10, width: w, borderRadius: 4 }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {[150, 90, 50, 50, 45, 70, 70, 45, 60].map((w, ci) => (
                    <td key={ci} style={{ padding: '14px' }}>
                      <div className="shimmer" style={{ height: 12, width: w, borderRadius: 4 }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <span className="material-symbols-rounded" style={{ fontSize: 40, color: '#f87171' }}>error</span>
        <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>
        <button onClick={fetchDaemonSets} style={{ padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'auto' }}>
      {/* Header */}
      <div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px', letterSpacing: 0.5 }}>WORKLOADS &gt; DAEMONSETS</p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>DaemonSets</h2>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <select value={selectedNs} onChange={(e) => setSelectedNs(e.target.value)} style={{ appearance: 'none', background: '#13131E', border: '1px solid #1E1E2E', borderRadius: 7, padding: '7px 28px 7px 10px', color: 'var(--text-primary)', fontSize: 12, fontFamily: "'DM Mono', monospace", outline: 'none', cursor: 'pointer' }}>
            <option value="">All namespaces</option>
            {namespaces.map((ns) => <option key={ns.name} value={ns.name}>{ns.name}</option>)}
          </select>
          <span className="material-symbols-rounded" style={{ position: 'absolute', right: 6, fontSize: 14, color: '#5a6380', pointerEvents: 'none', lineHeight: 1 }}>expand_more</span>
        </div>
        <button onClick={fetchDaemonSets} style={{ display: 'flex', alignItems: 'center', padding: 6, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 6 }} title="Refresh">
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>refresh</span>
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['NAME', 'NAMESPACE', 'DESIRED', 'CURRENT', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE', 'ACTIONS'].map((h) => (
                <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-secondary)', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((ds) => {
              const rowKey = `${ds.namespace}/${ds.name}`;
              const isHealthy = ds.ready === ds.desired && ds.desired > 0;
              const isDegraded = ds.ready < ds.desired;
              return (
                <tr key={rowKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: isHealthy ? '#4ade80' : isDegraded ? '#f87171' : '#facc15' }} />
                      {ds.name}
                    </div>
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{ds.namespace}</td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{ds.desired}</td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{ds.current}</td>
                  <td style={{ padding: '14px', fontSize: 13, color: isHealthy ? '#4ade80' : isDegraded ? '#f87171' : 'var(--text-secondary)', fontWeight: 600 }}>{ds.ready}</td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{ds.upToDate}</td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{ds.available}</td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{ds.age}</td>
                  <td style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => handleRestart(ds.name, ds.namespace)}
                        disabled={actionLoading === rowKey}
                        title="Restart"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: 'none', cursor: actionLoading === rowKey ? 'wait' : 'pointer', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: 17, animation: actionLoading === rowKey ? 'spin 1s linear infinite' : undefined }}>
                          {actionLoading === rowKey ? 'progress_activity' : 'restart_alt'}
                        </span>
                      </button>
                      <button
                        onClick={() => setYamlModal({ kind: 'DaemonSet', namespace: ds.namespace, name: ds.name })}
                        title="Edit YAML"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: 17, fontVariationSettings: "'FILL' 0, 'wght' 300" }}>edit_note</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No DaemonSets found with current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Page <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> of {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <PageBtn label="chevron_left" disabled={page <= 1} onClick={() => setPage(page - 1)} />
            <PageBtn label="chevron_right" disabled={page >= totalPages} onClick={() => setPage(page + 1)} />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <StatCard label="TOTAL" value={total} accent="var(--primary, #7C6DFA)" />
        <StatCard label="HEALTHY" value={stats.healthy} accent="#4ade80" />
        <StatCard label="DEGRADED" value={stats.degraded} accent="#f87171" />
        <StatCard label="TOTAL PODS DESIRED" value={daemonSets.reduce((s, d) => s + d.desired, 0)} accent="#facc15" />
      </div>

      {yamlModal && (
        <K8sYamlModal sessionId={sessionId} target={yamlModal} onClose={() => setYamlModal(null)} />
      )}
    </div>
  );
}

function PageBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card, #1b1b23)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, color: disabled ? 'rgba(255,255,255,0.15)' : 'var(--text-primary)', cursor: disabled ? 'default' : 'pointer' }}>
      <span className="material-symbols-rounded" style={{ fontSize: 20 }}>{label}</span>
    </button>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 10, padding: '16px 20px', borderLeft: `3px solid ${accent}` }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{value}</div>
    </div>
  );
}
