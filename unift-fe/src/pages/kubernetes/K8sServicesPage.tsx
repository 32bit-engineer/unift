/**
 * Kubernetes Services — Table listing cluster services with type badges,
 * cluster/external IPs, port mappings, namespace filter, and stat cards.
 *
 * Design reference: designs/unift/k8s_services/screen.png
 *
 * Data source: K8sController.listServices
 * via remoteConnectionAPI.listK8sServices
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { K8sServiceResource } from '@/utils/remoteConnectionAPI';
import { useK8sNamespaces } from '@/hooks/useK8sNamespaces';
import { K8S_PAGE_SIZE } from '@/config/pagination';
import { K8sYamlModal } from './K8sYamlModal';
import type { YamlModalTarget } from './K8sYamlModal';

interface K8sServicesPageProps {
  sessionId: string;
}

const PAGE_SIZE = K8S_PAGE_SIZE;

export function K8sServicesPage({ sessionId }: K8sServicesPageProps) {
  const [services, setServices] = useState<K8sServiceResource[]>([]);
  const [total, setTotal] = useState(0);
  const namespaces = useK8sNamespaces(sessionId);
  const [selectedNs, setSelectedNs] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [yamlModal, setYamlModal] = useState<YamlModalTarget | null>(null);

  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await remoteConnectionAPI.listK8sServices(sessionId, selectedNs);
      setServices(res.services);
      setTotal(res.total);
    } catch {
      setError('Failed to load services.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedNs]);

  useEffect(() => { fetchServices(); setPage(1); }, [fetchServices]);

  const totalPages = Math.max(1, Math.ceil(services.length / PAGE_SIZE));
  const paginated = useMemo(() => services.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [services, page]);

  const stats = useMemo(() => {
    const lbs = services.filter((s) => s.type === 'LoadBalancer').length;
    return { total: services.length, loadBalancers: lbs };
  }, [services]);

  if (loading && services.length === 0) {
    return (
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[0, 1, 2, 3].map(i => <div key={i} className="shimmer" style={{ borderRadius: 10, height: 80 }} />)}
        </div>
        <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
            <div className="shimmer" style={{ height: 16, width: 180, borderRadius: 4 }} />
            <div className="shimmer" style={{ height: 32, width: 140, borderRadius: 7 }} />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[140, 80, 100, 100, 70, 60].map((w, i) => (
                  <th key={i} style={{ padding: '12px 14px' }}>
                    <div className="shimmer" style={{ height: 10, width: w, borderRadius: 4 }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {[150, 70, 110, 110, 60, 50].map((w, ci) => (
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
        <button onClick={fetchServices} style={{ padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'auto' }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <StatCard label="ACTIVE SERVICES" value={stats.total} accent="#4ade80" />
        <StatCard label="LOAD BALANCERS" value={stats.loadBalancers} sub="Global" />
        <StatCard label="NAMESPACES" value={namespaces.length} />
        <StatCard label="SERVICE TYPES" value={[...new Set(services.map((s) => s.type))].join(', ') || '—'} small />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Table header row with namespace badge and controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, letterSpacing: 0.5 }}>
              NAMESPACE: {selectedNs ? selectedNs.toUpperCase() : 'ALL'}
            </h3>
            <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>
              HEALTHY
            </span>
            <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
              {total} TOTAL
            </span>
          </div>
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
              onClick={fetchServices}
              style={{ display: 'flex', alignItems: 'center', padding: 6, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              title="Refresh"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 20 }}>refresh</span>
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 750 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['SERVICE NAME', 'TYPE', 'CLUSTER IP', 'EXTERNAL IP', 'PORTS', 'ACTIONS'].map((h) => (
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
            {paginated.map((svc) => (
              <tr key={`${svc.namespace}/${svc.name}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '14px' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{svc.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
                      {svc.namespace}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px' }}>
                  <TypeBadge type={svc.type} />
                </td>
                <td style={{ padding: '14px' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: 12, fontFamily: "'DM Mono', monospace",
                    background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)',
                  }}>
                    {svc.clusterIp || '—'}
                  </span>
                </td>
                <td style={{ padding: '14px' }}>
                  {svc.externalIp && svc.externalIp !== '<none>' ? (
                    svc.externalIp === '<pending>' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#facc15' }}>
                        <span className="material-symbols-rounded" style={{ fontSize: 14, animation: 'spin 2s linear infinite' }}>sync</span>
                        Pending...
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: '#4ade80' }}>
                        {svc.externalIp}
                      </span>
                    )
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '14px' }}>
                  <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: 'var(--text-primary)' }}>
                    {svc.ports || '—'}
                  </div>
                </td>
                <td style={{ padding: '14px' }}>
                  <button
                    onClick={() => setYamlModal({ kind: 'Service', namespace: svc.namespace, name: svc.name })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 7,
                      border: '1px solid rgba(124,109,250,0.25)', cursor: 'pointer',
                      background: 'rgba(124,109,250,0.07)', color: '#a78bfa',
                      fontSize: 12, fontWeight: 500,
                    }}
                    title="Edit YAML"
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: 14, fontVariationSettings: "'FILL' 0, 'wght' 300" }}>edit_note</span>
                    Edit YAML
                  </button>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No services found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {/* Pagination */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>
            SHOWING {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, services.length)} OF {total} SERVICES
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setPage(page - 1)} disabled={page <= 1} style={pagerBtnStyle(page <= 1)}>Previous</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                style={{
                  ...pagerBtnStyle(false),
                  background: n === page ? 'var(--primary, #7C6DFA)' : 'transparent',
                  color: n === page ? '#fff' : 'var(--text-secondary)',
                  minWidth: 32,
                }}
              >
                {n}
              </button>
            ))}
            <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} style={pagerBtnStyle(page >= totalPages)}>Next</button>
          </div>
        </div>
      </div>
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

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500,
    background: 'transparent', color: disabled ? 'rgba(255,255,255,0.15)' : 'var(--text-secondary)',
    cursor: disabled ? 'default' : 'pointer',
  };
}

function StatCard({ label, value, accent, sub, small }: { label: string; value: string | number; accent?: string; sub?: string; small?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 10, padding: '18px 22px' }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{label}</span>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6,
      }}>
        <span style={{
          fontSize: small ? 14 : 28, fontWeight: 700,
          color: accent ?? 'var(--text-primary)',
          fontFamily: small ? "'DM Mono', monospace" : undefined,
        }}>
          {value}
        </span>
        {sub && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</span>}
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const color = type === 'LoadBalancer' ? '#7C6DFA'
    : type === 'ClusterIP' ? '#4ade80'
    : type === 'NodePort' ? '#facc15'
    : '#6b7280';
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: `${color}18`, color,
    }}>
      {type}
    </span>
  );
}
