/**
 * Kubernetes ConfigMaps — table listing cluster ConfigMaps with data key
 * count, key names preview, and YAML editing.
 *
 * Data source: K8sController.listConfigMaps via remoteConnectionAPI.listK8sConfigMaps
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { K8sConfigMap } from '@/utils/remoteConnectionAPI';
import { useK8sNamespaces } from '@/hooks/useK8sNamespaces';
import { K8S_PAGE_SIZE } from '@/config/pagination';
import { K8sYamlModal } from './K8sYamlModal';
import type { YamlModalTarget } from './K8sYamlModal';

interface K8sConfigMapsPageProps {
  sessionId: string;
}

const PAGE_SIZE = K8S_PAGE_SIZE;

export function K8sConfigMapsPage({ sessionId }: K8sConfigMapsPageProps) {
  const [configMaps, setConfigMaps] = useState<K8sConfigMap[]>([]);
  const [total, setTotal] = useState(0);
  const namespaces = useK8sNamespaces(sessionId);
  const [selectedNs, setSelectedNs] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [yamlModal, setYamlModal] = useState<YamlModalTarget | null>(null);

  const fetchConfigMaps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await remoteConnectionAPI.listK8sConfigMaps(sessionId, selectedNs);
      setConfigMaps(res.configMaps);
      setTotal(res.total);
    } catch {
      setError('Failed to load ConfigMaps.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedNs]);

  useEffect(() => { fetchConfigMaps(); setPage(1); }, [fetchConfigMaps]);

  const filtered = useMemo(() => {
    if (!search.trim()) return configMaps;
    const q = search.toLowerCase();
    return configMaps.filter(cm => cm.name.toLowerCase().includes(q) || cm.namespace.toLowerCase().includes(q) || cm.dataKeys.some(k => k.toLowerCase().includes(q)));
  }, [configMaps, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  if (loading && configMaps.length === 0) {
    return (
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="shimmer" style={{ height: 11, width: 150, borderRadius: 4, marginBottom: 8 }} />
          <div className="shimmer" style={{ height: 26, width: 140, borderRadius: 6 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="shimmer" style={{ height: 36, width: 150, borderRadius: 7 }} />
          <div className="shimmer" style={{ height: 36, width: 200, borderRadius: 7 }} />
        </div>
        <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[140, 100, 50, 200, 55, 60].map((w, i) => (
                  <th key={i} style={{ padding: '12px 14px' }}>
                    <div className="shimmer" style={{ height: 10, width: w, borderRadius: 4 }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {[150, 90, 40, 210, 45, 50].map((w, ci) => (
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
        <button onClick={fetchConfigMaps} style={{ padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'auto' }}>
      {/* Header */}
      <div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px', letterSpacing: 0.5 }}>CONFIG &gt; CONFIGMAPS</p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>ConfigMaps</h2>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--bg-card, #1b1b23)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', flex: 1, maxWidth: 280 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 16, color: 'var(--text-secondary)' }}>search</span>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or key..."
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, outline: 'none', flex: 1 }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{filtered.length} of {total}</span>
        <button onClick={fetchConfigMaps} style={{ display: 'flex', alignItems: 'center', padding: 6, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 6 }} title="Refresh">
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>refresh</span>
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['NAME', 'NAMESPACE', 'KEYS', 'KEY NAMES', 'AGE', 'ACTIONS'].map((h) => (
                <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-secondary)', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((cm) => {
              const rowKey = `${cm.namespace}/${cm.name}`;
              return (
                <tr key={rowKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{cm.name}</td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{cm.namespace}</td>
                  <td style={{ padding: '14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, background: 'rgba(250,204,21,0.1)', color: '#facc15', fontSize: 11, fontWeight: 700 }}>
                      {cm.dataCount}
                    </span>
                  </td>
                  <td style={{ padding: '14px', maxWidth: 320 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {cm.dataKeys.slice(0, 5).map((key) => (
                        <span key={key} style={{ padding: '1px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                          {key}
                        </span>
                      ))}
                      {cm.dataKeys.length > 5 && (
                        <span style={{ padding: '1px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: '#6b7280', fontSize: 11 }}>
                          +{cm.dataKeys.length - 5} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)' }}>{cm.age}</td>
                  <td style={{ padding: '14px' }}>
                    <button
                      onClick={() => setYamlModal({ kind: 'ConfigMap', namespace: cm.namespace, name: cm.name })}
                      title="Edit YAML"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 17, fontVariationSettings: "'FILL' 0, 'wght' 300" }}>edit_note</span>
                    </button>
                  </td>
                </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No ConfigMaps found with current filters.
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
        <StatCard label="TOTAL CONFIGMAPS" value={total} accent="var(--primary, #7C6DFA)" />
        <StatCard label="TOTAL KEYS" value={configMaps.reduce((s, cm) => s + cm.dataCount, 0)} accent="#facc15" />
        <StatCard label="NAMESPACES" value={new Set(configMaps.map(cm => cm.namespace)).size} accent="#60a5fa" />
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
