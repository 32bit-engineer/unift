/**
 * Kubernetes Ingress — table listing all Ingress resources across namespaces.
 * Shows class, TLS status, host rules, and per-ingress YAML editing.
 *
 * Data source: K8sController.listIngresses via remoteConnectionAPI.listK8sIngresses
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { K8sIngress, K8sNamespace } from '@/utils/remoteConnectionAPI';
import { K8sYamlModal } from './K8sYamlModal';
import type { YamlModalTarget } from './K8sYamlModal';

interface K8sIngressPageProps {
  sessionId: string;
}

const PAGE_SIZE = 10;

export function K8sIngressPage({ sessionId }: K8sIngressPageProps) {
  const [ingresses, setIngresses] = useState<K8sIngress[]>([]);
  const [total, setTotal] = useState(0);
  const [namespaces, setNamespaces] = useState<K8sNamespace[]>([]);
  const [selectedNs, setSelectedNs] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [yamlModal, setYamlModal] = useState<YamlModalTarget | null>(null);

  const fetchNamespaces = useCallback(async () => {
    try {
      const nsList = await remoteConnectionAPI.listK8sNamespaces(sessionId);
      setNamespaces(nsList);
    } catch { /* silent */ }
  }, [sessionId]);

  const fetchIngresses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await remoteConnectionAPI.listK8sIngresses(sessionId, selectedNs);
      setIngresses(res.ingresses);
      setTotal(res.total);
    } catch {
      setError('Failed to load ingresses.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedNs]);

  useEffect(() => { fetchNamespaces(); }, [fetchNamespaces]);
  useEffect(() => { fetchIngresses(); setPage(1); }, [fetchIngresses]);

  const totalPages = Math.max(1, Math.ceil(ingresses.length / PAGE_SIZE));
  const paginated = useMemo(
    () => ingresses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [ingresses, page],
  );

  if (loading && ingresses.length === 0) {
    return (
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="shimmer" style={{ height: 11, width: 170, borderRadius: 4, marginBottom: 8 }} />
          <div className="shimmer" style={{ height: 26, width: 120, borderRadius: 6 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="shimmer" style={{ height: 36, width: 150, borderRadius: 7 }} />
        </div>
        <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[140, 100, 80, 110, 50, 55, 55, 70].map((w, i) => (
                  <th key={i} style={{ padding: '12px 14px' }}>
                    <div className="shimmer" style={{ height: 10, width: w, borderRadius: 4 }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {[150, 90, 70, 120, 40, 45, 45, 60].map((w, ci) => (
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
        <button onClick={fetchIngresses} style={{ padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'auto' }}>
      {/* Header */}
      <div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px', letterSpacing: 0.5 }}>NETWORKING &gt; INGRESSES</p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Ingresses</h2>
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
        <button onClick={fetchIngresses} style={{ display: 'flex', alignItems: 'center', padding: 6, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 6 }} title="Refresh">
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>refresh</span>
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['NAME', 'NAMESPACE', 'CLASS', 'HOSTS', 'TLS', 'RULES', 'AGE', 'ACTIONS'].map((h) => (
                <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-secondary)', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((ing) => {
              const rowKey = `${ing.namespace}/${ing.name}`;
              const isExpanded = expanded === rowKey;
              const hostList = ing.rules.map(r => r.host).filter(Boolean);
              return (
                <>
                  <tr key={rowKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }} onClick={() => setExpanded(isExpanded ? null : rowKey)}>
                    <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{ing.name}</td>
                    <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{ing.namespace}</td>
                    <td style={{ padding: '14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(124,109,250,0.1)', color: '#c6bfff', fontSize: 11, fontWeight: 600 }}>
                        {ing.className || 'default'}
                      </span>
                    </td>
                    <td style={{ padding: '14px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace", maxWidth: 200 }}>
                      {hostList.length > 0 ? hostList.slice(0, 2).join(', ') + (hostList.length > 2 ? ` +${hostList.length - 2}` : '') : '—'}
                    </td>
                    <td style={{ padding: '14px' }}>
                      {ing.tls ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#4ade80', fontWeight: 600 }}>
                          <span className="material-symbols-rounded" style={{ fontSize: 13, fontVariationSettings: "'FILL' 1" }}>lock</span> TLS
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#6b7280' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{ing.rules.length}</td>
                    <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{ing.age}</td>
                    <td style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setYamlModal({ kind: 'Ingress', namespace: ing.namespace, name: ing.name }); }}
                          title="Edit YAML"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: 17, fontVariationSettings: "'FILL' 0, 'wght' 300" }}>edit_note</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : rowKey); }}
                          title={isExpanded ? 'Collapse' : 'Expand rules'}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: 17 }}>{isExpanded ? 'expand_less' : 'expand_more'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && ing.rules.length > 0 && (
                    <tr key={`${rowKey}-rules`} style={{ background: 'rgba(0,0,0,0.25)' }}>
                      <td colSpan={8} style={{ padding: '0 14px 14px 14px' }}>
                        <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {ing.rules.map((rule, ri) => (
                            <div key={ri} style={{ borderLeft: '2px solid rgba(124,109,250,0.3)', paddingLeft: 12 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#c6bfff', marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>
                                {rule.host || '*'}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {rule.paths.map((p, pi) => (
                                  <div key={pi} style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace" }}>
                                    <span style={{ color: '#facc15' }}>{p.path || '/'}</span>
                                    <span style={{ color: '#6b7280' }}>{p.pathType}</span>
                                    <span>→ {p.serviceName}:{p.servicePort}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No ingresses found with current filters.
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <StatCard label="TOTAL INGRESSES" value={total} accent="var(--primary, #7C6DFA)" />
        <StatCard label="WITH TLS" value={ingresses.filter(i => i.tls).length} accent="#4ade80" />
        <StatCard label="TOTAL RULES" value={ingresses.reduce((s, i) => s + i.rules.length, 0)} accent="#facc15" />
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
