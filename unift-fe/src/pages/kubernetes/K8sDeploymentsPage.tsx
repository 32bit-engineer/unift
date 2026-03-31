/**
 * Kubernetes Deployments — Table listing cluster deployments with replica
 * status, strategy, scale and restart actions, and summary stat cards.
 *
 * Design reference: designs/unift/k8s_deployments/screen.png
 *
 * Data source: K8sController.listDeployments, scaleDeployment, restartDeployment
 * via remoteConnectionAPI
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { K8sDeployment, K8sNamespace } from '@/utils/remoteConnectionAPI';
import { K8sYamlModal } from './K8sYamlModal';
import type { YamlModalTarget } from './K8sYamlModal';

interface K8sDeploymentsPageProps {
  sessionId: string;
}

const PAGE_SIZE = 10;

export function K8sDeploymentsPage({ sessionId }: K8sDeploymentsPageProps) {
  const [deployments, setDeployments] = useState<K8sDeployment[]>([]);
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

  const fetchDeployments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await remoteConnectionAPI.listK8sDeployments(sessionId, selectedNs);
      setDeployments(res.deployments);
      setTotal(res.total);
    } catch {
      setError('Failed to load deployments.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedNs]);

  useEffect(() => { fetchNamespaces(); }, [fetchNamespaces]);
  useEffect(() => { fetchDeployments(); setPage(1); }, [fetchDeployments]);

  const stats = useMemo(() => {
    const totalReplicas = deployments.reduce((s, d) => s + d.replicas, 0);
    const readyReplicas = deployments.reduce((s, d) => s + d.readyReplicas, 0);
    return { totalReplicas, readyReplicas };
  }, [deployments]);

  const totalPages = Math.max(1, Math.ceil(deployments.length / PAGE_SIZE));
  const paginated = useMemo(() => deployments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [deployments, page]);

  const handleScale = async () => {
    if (!scaleDialog) return;
    const key = `scale-${scaleDialog.namespace}/${scaleDialog.name}`;
    setActionLoading(key);
    try {
      await remoteConnectionAPI.scaleK8sDeployment(sessionId, scaleDialog.name, scaleValue, scaleDialog.namespace);
      setScaleDialog(null);
      await fetchDeployments();
    } catch { /* silent */ } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async (name: string, namespace: string) => {
    const key = `restart-${namespace}/${name}`;
    setActionLoading(key);
    try {
      await remoteConnectionAPI.restartK8sDeployment(sessionId, name, namespace);
      await fetchDeployments();
    } catch { /* silent */ } finally {
      setActionLoading(null);
    }
  };

  if (loading && deployments.length === 0) {
    return (
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[0, 1, 2, 3].map(i => <div key={i} className="shimmer" style={{ borderRadius: 10, height: 80 }} />)}
        </div>
        <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
            <div className="shimmer" style={{ height: 16, width: 200, borderRadius: 4 }} />
            <div className="shimmer" style={{ height: 32, width: 150, borderRadius: 7 }} />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[140, 100, 70, 80, 50, 70, 90].map((w, i) => (
                  <th key={i} style={{ padding: '12px 14px' }}>
                    <div className="shimmer" style={{ height: 10, width: w, borderRadius: 4 }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {[150, 90, 60, 80, 45, 60, 70].map((w, ci) => (
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
        <button onClick={fetchDeployments} style={{ padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'auto' }}>
      {/* Stat cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <StatCard label="TOTAL DEPLOYMENTS" value={total} />
        <StatCard label="HEALTHY REPLICAS" value={`${stats.readyReplicas}/${stats.totalReplicas}`} accent="#4ade80" />
        <StatCard label="NAMESPACES" value={namespaces.length} />
        <StatCard label="STRATEGIES" value={[...new Set(deployments.map((d) => d.strategy))].join(', ') || '—'} small />
      </div>

      {/* Table header with namespace filter */}
      <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Deployments in {selectedNs || 'all namespaces'}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select
                value={selectedNs}
                onChange={(e) => setSelectedNs(e.target.value)}
                style={{
                  appearance: 'none', background: '#13131E', border: '1px solid #1E1E2E',
                  borderRadius: 7, padding: '7px 28px 7px 10px', color: 'var(--text-primary)',
                  fontSize: 12, fontFamily: "'DM Mono', monospace", outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="">All namespaces</option>
                {namespaces.map((ns) => <option key={ns.name} value={ns.name}>{ns.name}</option>)}
              </select>
              <span className="material-symbols-rounded" style={{ position: 'absolute', right: 6, fontSize: 14, color: '#5a6380', pointerEvents: 'none', lineHeight: 1 }}>expand_more</span>
            </div>
            <button
              onClick={fetchDeployments}
              style={{ display: 'flex', alignItems: 'center', padding: 6, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              title="Refresh"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 20 }}>refresh</span>
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['NAME', 'NAMESPACE', 'REPLICAS', 'STRATEGY', 'AGE', 'STATUS', 'ACTIONS'].map((h) => (
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
            {paginated.map((dep) => {
              const healthy = dep.readyReplicas >= dep.replicas && dep.replicas > 0;
              const crash = dep.readyReplicas === 0 && dep.replicas > 0;
              const statusLabel = crash ? 'CrashLoopBackOff' : healthy ? 'Running' : 'Progressing';
              const nsKey = `${dep.namespace}/${dep.name}`;
              const labels = dep.labels ? Object.entries(dep.labels).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ') : '';

              return (
                <tr key={nsKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '14px', maxWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: crash ? '#f87171' : healthy ? '#4ade80' : '#facc15' }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{dep.name}</div>
                        {labels && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{labels}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: 11, fontFamily: "'DM Mono', monospace",
                      background: 'rgba(124,109,250,0.1)', color: '#c6bfff',
                    }}>
                      {dep.namespace}
                    </span>
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: crash ? '#f87171' : 'var(--text-primary)', fontWeight: 600 }}>
                    {dep.readyReplicas}/{dep.replicas}
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{dep.strategy}</td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{dep.age}</td>
                  <td style={{ padding: '14px' }}>
                    <StatusPill status={statusLabel} />
                  </td>
                  <td style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <ActionBtn
                        icon="expand"
                        title="Scale"
                        onClick={() => { setScaleDialog({ name: dep.name, namespace: dep.namespace, current: dep.replicas }); setScaleValue(dep.replicas); }}
                      />
                      <ActionBtn
                        icon="restart_alt"
                        title="Restart"
                        loading={actionLoading === `restart-${nsKey}`}
                        onClick={() => handleRestart(dep.name, dep.namespace)}
                      />
                      <ActionBtn
                        icon="edit_note"
                        title="Edit YAML"
                        onClick={() => setYamlModal({ kind: 'Deployment', namespace: dep.namespace, name: dep.name })}
                      />
                      <ActionBtn icon="arrow_forward" title="View Details" onClick={() => {}} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {deployments.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No deployments found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

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

      {/* Scale dialog */}
      {scaleDialog && (
        <>
          <div onClick={() => setScaleDialog(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: '#13131b', borderRadius: 14, padding: 28, zIndex: 1001, width: 340,
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Scale Deployment</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)' }}>
              {scaleDialog.name} in {scaleDialog.namespace}
            </p>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>REPLICAS</label>
            <input
              type="number"
              min={0}
              max={100}
              value={scaleValue}
              onChange={(e) => setScaleValue(Math.max(0, Math.min(100, Number(e.target.value))))}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setScaleDialog(null)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={handleScale}
                disabled={actionLoading !== null}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                  background: 'var(--primary, #7C6DFA)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                {actionLoading ? 'Scaling...' : 'Apply'}
              </button>
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

function StatCard({ label, value, accent, small }: { label: string; value: string | number; accent?: string; small?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 10, padding: '18px 22px' }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{label}</span>
      <div style={{
        fontSize: small ? 14 : 28, fontWeight: 700, marginTop: 6,
        color: accent ?? 'var(--text-primary)',
        fontFamily: small ? "'DM Mono', monospace" : undefined,
      }}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const lower = status.toLowerCase();
  const color = lower === 'running' ? '#4ade80'
    : lower === 'progressing' ? '#facc15'
    : lower.includes('crash') ? '#f87171'
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

function PageBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-card, #1b1b23)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'rgba(255,255,255,0.15)' : 'var(--text-primary)',
      }}
    >
      <span className="material-symbols-rounded" style={{ fontSize: 20 }}>{label}</span>
    </button>
  );
}

function ActionBtn({ icon, title, onClick, loading }: {
  icon: string; title: string; onClick: () => void; loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: 6, border: 'none', cursor: loading ? 'wait' : 'pointer',
        background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
        transition: 'background 0.15s',
      }}
    >
      <span className="material-symbols-rounded" style={{
        fontSize: 17, animation: loading ? 'spin 1s linear infinite' : undefined,
      }}>
        {loading ? 'progress_activity' : icon}
      </span>
    </button>
  );
}
