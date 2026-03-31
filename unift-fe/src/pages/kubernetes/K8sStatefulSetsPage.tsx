/**
 * Kubernetes StatefulSets — table listing cluster StatefulSets with replica
 * status, headless service name, scale and restart actions, and YAML editing.
 *
 * Data source: K8sController.listStatefulSets, scaleStatefulSet, restartStatefulSet
 * via remoteConnectionAPI
 */
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { K8sStatefulSet, K8sNamespace } from '@/utils/remoteConnectionAPI';
import { K8sYamlModal } from './K8sYamlModal';
import type { YamlModalTarget } from './K8sYamlModal';

interface K8sStatefulSetsPageProps {
  sessionId: string;
}

const PAGE_SIZE = 10;

export function K8sStatefulSetsPage({ sessionId }: K8sStatefulSetsPageProps) {
  const [statefulSets, setStatefulSets] = useState<K8sStatefulSet[]>([]);
  const [total, setTotal] = useState(0);
  const [namespaces, setNamespaces] = useState<K8sNamespace[]>([]);
  const [selectedNs, setSelectedNs] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [scaleDialog, setScaleDialog] = useState<{ name: string; namespace: string; current: number } | null>(null);
  const [scaleValue, setScaleValue] = useState(1);
  const [yamlModal, setYamlModal] = useState<YamlModalTarget | null>(null);

  const fetchNamespaces = useCallback(async () => {
    try {
      const nsList = await remoteConnectionAPI.listK8sNamespaces(sessionId);
      setNamespaces(nsList);
    } catch { /* silent */ }
  }, [sessionId]);

  const fetchStatefulSets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await remoteConnectionAPI.listK8sStatefulSets(sessionId, selectedNs);
      setStatefulSets(res.statefulSets);
      setTotal(res.total);
    } catch {
      setError('Failed to load StatefulSets.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedNs]);

  useEffect(() => { fetchNamespaces(); }, [fetchNamespaces]);
  useEffect(() => { fetchStatefulSets(); setPage(1); }, [fetchStatefulSets]);

  const stats = useMemo(() => {
    const ready = statefulSets.filter(s => s.readyReplicas === s.replicas && s.replicas > 0).length;
    const degraded = statefulSets.filter(s => s.readyReplicas < s.replicas).length;
    return { ready, degraded };
  }, [statefulSets]);

  const totalPages = Math.max(1, Math.ceil(statefulSets.length / PAGE_SIZE));
  const paginated = useMemo(() => statefulSets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [statefulSets, page]);

  const handleScale = async () => {
    if (!scaleDialog) return;
    const key = `scale-${scaleDialog.namespace}/${scaleDialog.name}`;
    setActionLoading(key);
    try {
      await remoteConnectionAPI.scaleK8sStatefulSet(sessionId, scaleDialog.name, scaleValue, scaleDialog.namespace);
      setScaleDialog(null);
      await fetchStatefulSets();
    } catch { /* silent */ } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async (name: string, namespace: string) => {
    const key = `restart-${namespace}/${name}`;
    setActionLoading(key);
    try {
      await remoteConnectionAPI.restartK8sStatefulSet(sessionId, name, namespace);
      await fetchStatefulSets();
    } catch { /* silent */ } finally {
      setActionLoading(null);
    }
  };

  if (loading && statefulSets.length === 0) {
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
                {[140, 100, 60, 70, 90, 60, 80].map((w, i) => (
                  <th key={i} style={{ padding: '12px 14px' }}>
                    <div className="shimmer" style={{ height: 10, width: w, borderRadius: 4 }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {[150, 90, 55, 65, 100, 55, 70].map((w, ci) => (
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
        <button onClick={fetchStatefulSets} style={{ padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'auto' }}>
      {/* Header */}
      <div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px', letterSpacing: 0.5 }}>WORKLOADS &gt; STATEFULSETS</p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>StatefulSets</h2>
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
        <button onClick={fetchStatefulSets} style={{ display: 'flex', alignItems: 'center', padding: 6, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 6 }} title="Refresh">
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>refresh</span>
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['NAME', 'NAMESPACE', 'READY', 'REPLICAS', 'SERVICE', 'AGE', 'ACTIONS'].map((h) => (
                <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-secondary)', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((sts) => {
              const rowKey = `${sts.namespace}/${sts.name}`;
              const isReady = sts.readyReplicas === sts.replicas && sts.replicas > 0;
              const isDegraded = sts.readyReplicas < sts.replicas;
              return (
                <tr key={rowKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: isReady ? '#4ade80' : isDegraded ? '#f87171' : '#facc15' }} />
                      {sts.name}
                    </div>
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{sts.namespace}</td>
                  <td style={{ padding: '14px' }}>
                    <ReplicaPill ready={sts.readyReplicas} total={sts.replicas} />
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{sts.replicas}</td>
                  <td style={{ padding: '14px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace" }}>{sts.serviceName || '—'}</td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{sts.age}</td>
                  <td style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => { setScaleValue(sts.replicas); setScaleDialog({ name: sts.name, namespace: sts.namespace, current: sts.replicas }); }}
                        title="Scale"
                        style={actionBtnStyle()}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: 17, fontVariationSettings: "'FILL' 0, 'wght' 300" }}>tune</span>
                      </button>
                      <button
                        onClick={() => handleRestart(sts.name, sts.namespace)}
                        disabled={actionLoading === `restart-${rowKey}`}
                        title="Restart"
                        style={actionBtnStyle()}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: 17, animation: actionLoading === `restart-${rowKey}` ? 'spin 1s linear infinite' : undefined }}>
                          {actionLoading === `restart-${rowKey}` ? 'progress_activity' : 'restart_alt'}
                        </span>
                      </button>
                      <button
                        onClick={() => setYamlModal({ kind: 'StatefulSet', namespace: sts.namespace, name: sts.name })}
                        title="Edit YAML"
                        style={actionBtnStyle()}
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
                <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No StatefulSets found with current filters.
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
        <StatCard label="HEALTHY" value={stats.ready} accent="#4ade80" />
        <StatCard label="DEGRADED" value={stats.degraded} accent="#f87171" />
        <StatCard label="TOTAL REPLICAS" value={statefulSets.reduce((s, st) => s + st.replicas, 0)} accent="#facc15" />
      </div>

      {/* Scale dialog */}
      {scaleDialog && (
        <>
          <div onClick={() => setScaleDialog(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1101, background: '#0B0B14', borderRadius: 14, padding: 28, width: 340, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Scale StatefulSet</h3>
            <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-secondary)' }}>{scaleDialog.name} — current: {scaleDialog.current}</p>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>REPLICAS</label>
            <input
              type="number" min={0} max={20} value={scaleValue}
              onChange={(e) => setScaleValue(Number(e.target.value))}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setScaleDialog(null)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button
                onClick={handleScale}
                disabled={!!actionLoading}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--primary, #7C6DFA)', color: '#fff', cursor: actionLoading ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {actionLoading ? 'Scaling…' : 'Apply'}
              </button>
            </div>
          </div>
        </>
      )}

      {yamlModal && (
        <K8sYamlModal sessionId={sessionId} target={yamlModal} onClose={() => setYamlModal(null)} />
      )}
    </div>
  );
}

function ReplicaPill({ ready, total }: { ready: number; total: number }) {
  const color = ready === total && total > 0 ? '#4ade80' : ready < total ? '#f87171' : '#6b7280';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${color}18`, color }}>
      {ready}/{total}
    </span>
  );
}

function actionBtnStyle(): CSSProperties {
  return { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', transition: 'background 0.15s' };
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

