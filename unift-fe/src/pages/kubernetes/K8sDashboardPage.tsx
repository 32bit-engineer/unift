/**
 * Kubernetes Dashboard — Cluster overview showing resource counts,
 * pod lifecycle summary, node & deployment stats, namespace breakdown,
 * and cluster health information.
 *
 * Design reference: designs/unift/k8s_dashboard_overview/screen.png
 *
 * Data source: K8sController.getOverview
 * via remoteConnectionAPI.getK8sOverview
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { K8sOverview, K8sNamespace, K8sPod } from '@/utils/remoteConnectionAPI';

interface K8sDashboardPageProps {
  sessionId: string;
}

export function K8sDashboardPage({ sessionId }: K8sDashboardPageProps) {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<K8sOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await remoteConnectionAPI.getK8sOverview(sessionId);
      setOverview(res);
    } catch {
      setError('Failed to load K8s overview. kubectl may not be available on this host.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const podStatusCounts = useMemo(() => {
    if (!overview) return { total: 0, running: 0, pending: 0, failed: 0 };
    return {
      total: overview.totalPods,
      running: overview.runningPods,
      pending: overview.pendingPods,
      failed: overview.failedPods,
    };
  }, [overview]);

  const topNamespaces = useMemo((): (K8sNamespace & { podCount: number })[] => {
    if (!overview?.namespaces || !overview?.recentPods) return [];
    const podsByNs = new Map<string, number>();
    for (const pod of overview.recentPods) {
      podsByNs.set(pod.namespace, (podsByNs.get(pod.namespace) ?? 0) + 1);
    }
    return overview.namespaces
      .map((ns) => ({ ...ns, podCount: podsByNs.get(ns.name) ?? 0 }))
      .sort((a, b) => b.podCount - a.podCount)
      .slice(0, 5);
  }, [overview]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        <span className="material-symbols-rounded" style={{ fontSize: 28, marginRight: 10, animation: 'spin 1s linear infinite' }}>progress_activity</span>
        Loading Kubernetes overview...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <span className="material-symbols-rounded" style={{ fontSize: 40, color: '#f87171' }}>cloud_off</span>
        <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>
        <button
          onClick={fetchOverview}
          style={{ padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!overview) return null;

  const clusterHealthy = overview.clusterInfo.available;

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24, overflow: 'auto', height: '100%' }}>
      {/* Top stat cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {/* Pod count card */}
        <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Pods</span>
          <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>{overview.totalPods}</span>
          <span style={{ fontSize: 12, color: '#4ade80' }}>{overview.runningPods} running</span>
        </div>

        {/* Deployments & Services */}
        <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Deployments</span>
          <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>{overview.totalDeployments}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{overview.totalServices} services</span>
        </div>

        {/* Cluster Health */}
        <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Cluster Health</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
              background: clusterHealthy ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
              color: clusterHealthy ? '#4ade80' : '#f87171',
            }}>
              {clusterHealthy ? 'HEALTHY' : 'UNHEALTHY'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            <ClusterComponent label="API Server" ready={clusterHealthy} />
            <ClusterComponent label="Scheduler" ready={clusterHealthy} />
            <ClusterComponent label="Controller" ready={clusterHealthy} />
            <ClusterComponent label="etcd" ready={clusterHealthy} />
          </div>
        </div>
      </div>

      {/* Main content: Pod lifecycle + Nodes/Deployments sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        {/* Pod Lifecycle Summary */}
        <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Pod Lifecycle Summary</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                Real-time status of {overview.totalPods} scheduled workloads
              </p>
            </div>
            <div className="flex gap-20 height-full" style={{ marginTop: -4 }}>
              <PodStatBadge label="TOTAL" value={podStatusCounts.total} />
              <PodStatBadge label="RUNNING" value={podStatusCounts.running} highlight />
              <PodStatBadge label="PENDING" value={podStatusCounts.pending} />
              <PodStatBadge label="FAILED" value={podStatusCounts.failed} warn={podStatusCounts.failed > 0} />
            </div>
          </div>

          {/* Pod bar chart visualization */}
          <PodBarChart pods={overview.recentPods} />
        </div>

        {/* Right sidebar: Nodes & Deployments + Top Namespaces */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Node & Deployments */}
          <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, padding: '20px 24px' }}>
            <h4 style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 16px' }}>
              Node & Deployments
            </h4>
            <NavStatRow
              icon="dns"
              label="TOTAL NODES"
              value={String(overview.totalNodes).padStart(2, '0')}
              onClick={() => navigate(`/workspace/${sessionId}/k8s/nodes`)}
            />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '12px 0' }} />
            <NavStatRow
              icon="deployed_code"
              label="TOTAL DEPLOYMENTS"
              value={String(overview.totalDeployments).padStart(2, '0')}
              onClick={() => navigate(`/workspace/${sessionId}/k8s/deployments`)}
            />
          </div>

          {/* Top Namespaces */}
          <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, padding: '20px 24px' }}>
            <h4 style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 16px' }}>
              Top Namespaces
            </h4>
            {topNamespaces.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No namespace data available</p>
            ) : (
              topNamespaces.map((ns) => (
                <div key={ns.name} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{ns.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ns.podCount} Pods</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${Math.min(100, (ns.podCount / Math.max(overview.totalPods, 1)) * 100)}%`,
                      background: 'var(--primary, #7C6DFA)',
                    }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Pods list */}
      <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Recent Pods</h3>
          <button
            onClick={() => navigate(`/workspace/${sessionId}/k8s/pods`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
              background: 'rgba(124,109,250,0.1)', color: 'var(--primary, #7C6DFA)',
              border: '1px solid rgba(124,109,250,0.2)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}
          >
            View All Pods
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>arrow_forward</span>
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['POD NAME', 'NAMESPACE', 'STATUS', 'NODE', 'RESTARTS', 'AGE'].map((h) => (
                <th key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-secondary)', textAlign: 'left', textTransform: 'uppercase' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overview.recentPods.slice(0, 8).map((pod) => (
              <tr key={pod.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '12px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: pod.status === 'Running' ? '#4ade80' : pod.status === 'Pending' ? '#facc15' : '#f87171',
                    }} />
                    {pod.name}
                  </div>
                </td>
                <td style={{ padding: '12px', fontSize: 13, color: 'var(--text-secondary)' }}>{pod.namespace}</td>
                <td style={{ padding: '12px' }}>
                  <StatusPill status={pod.status} />
                </td>
                <td style={{ padding: '12px', fontSize: 13, color: 'var(--text-secondary)' }}>{pod.nodeName}</td>
                <td style={{ padding: '12px', fontSize: 13, color: pod.restarts > 0 ? '#f87171' : 'var(--text-secondary)', fontWeight: pod.restarts > 0 ? 600 : 400 }}>
                  {pod.restarts}
                </td>
                <td style={{ padding: '12px', fontSize: 13, color: 'var(--text-secondary)' }}>{pod.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cluster Info footer */}
      <div style={{
        display: 'flex', gap: 24, padding: '14px 20px',
        background: 'var(--bg-card, #1b1b23)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)',
      }}>
        <span>Server: <strong style={{ color: 'var(--text-primary)' }}>{overview.clusterInfo.serverVersion || '—'}</strong></span>
        <span>Platform: <strong style={{ color: 'var(--text-primary)' }}>{overview.clusterInfo.platform || '—'}</strong></span>
        <span>Cluster: <strong style={{ color: 'var(--text-primary)' }}>{overview.clusterInfo.clusterName || '—'}</strong></span>
        <span>Nodes: <strong style={{ color: 'var(--text-primary)' }}>{overview.readyNodes}/{overview.totalNodes} ready</strong></span>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={fetchOverview}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--primary, #7C6DFA)', cursor: 'pointer', fontSize: 12 }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>refresh</span>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

/*
 * Bar chart for Pod Lifecycle Summary panel.
 * Uses deterministic bar heights derived from pod index + status,
 * and renders a custom floating tooltip on hover with full pod details.
 */
interface TooltipState {
  pod: K8sPod;
  x: number;
  y: number;
}

function podBarHeight(pod: K8sPod, index: number): number {
  // Deterministic pseudo-random spread using the pod name's char codes
  const seed = pod.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), index * 7) % 100;
  if (pod.status === 'Running') return 90 + (seed % 70);
  if (pod.status === 'Pending') return 50 + (seed % 60);
  return 20 + (seed % 40);
}

function PodBarChart({ pods }: { pods: K8sPod[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const visible = pods.slice(0, 24);

  const handleMouseEnter = (pod: K8sPod, index: number, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ pod, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!tooltip) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip(prev => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
  };

  const handleMouseLeave = () => setTooltip(null);

  const statusColor = (status: string) => {
    if (status === 'Running') return '#4ade80';
    if (status === 'Pending') return '#a78bfa';
    if (status === 'Failed') return '#f87171';
    return '#6b7280';
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', marginTop: 12, flex: 1, display: 'flex', flexDirection: 'column' }} onMouseMove={handleMouseMove}>
      {/* Bar chart — grows to fill all remaining card height */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flex: 1 }}>
        {visible.map((pod, i) => {
          const rawHeight = podBarHeight(pod, i);
          const heightPct = `${Math.round((rawHeight / 200) * 100)}%`;
          const color = statusColor(pod.status);
          return (
            <div
              key={pod.name + i}
              onMouseEnter={(e) => handleMouseEnter(pod, i, e)}
              onMouseLeave={handleMouseLeave}
              style={{
                flex: 1,
                minWidth: 10,
                height: heightPct,
                background: color,
                borderRadius: '4px 4px 0 0',
                opacity: tooltip?.pod.name === pod.name ? 1 : 0.72,
                transform: tooltip?.pod.name === pod.name ? 'scaleY(1.04)' : 'scaleY(1)',
                transformOrigin: 'bottom',
                transition: 'opacity 0.15s ease, transform 0.15s ease',
                cursor: 'pointer',
              }}
            />
          );
        })}
      </div>

      {/* Baseline */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginTop: 2 }} />

      {/* Custom floating tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(tooltip.x + 12, (containerRef.current?.offsetWidth ?? 400) - 220),
            top: Math.max(tooltip.y - 120, 0),
            background: '#1e1e2e',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            padding: '10px 14px',
            pointerEvents: 'none',
            zIndex: 50,
            minWidth: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {/* Status indicator + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: statusColor(tooltip.pod.status),
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', wordBreak: 'break-all' }}>
              {tooltip.pod.name}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <TooltipRow label="Status" value={tooltip.pod.status} valueColor={statusColor(tooltip.pod.status)} />
            <TooltipRow label="Namespace" value={tooltip.pod.namespace || '—'} />
            <TooltipRow label="Node" value={tooltip.pod.nodeName || '—'} />
            <TooltipRow
              label="Restarts"
              value={String(tooltip.pod.restarts)}
              valueColor={tooltip.pod.restarts > 0 ? '#f87171' : undefined}
            />
            {tooltip.pod.ip && <TooltipRow label="IP" value={tooltip.pod.ip} mono />}
          </div>
        </div>
      )}
    </div>
  );
}

function TooltipRow({ label, value, valueColor, mono }: { label: string; value: string; valueColor?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 11, fontWeight: 500,
        color: valueColor ?? 'rgba(255,255,255,0.75)',
        fontFamily: mono ? 'DM Mono, monospace' : undefined,
        textAlign: 'right',
      }}>{value}</span>
    </div>
  );
}

function ClusterComponent({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
      background: 'rgba(255,255,255,0.03)', borderRadius: 6,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ready ? '#4ade80' : '#f87171' }} />
      <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{label}</span>
    </div>
  );
}

function PodStatBadge({ label, value, highlight, warn }: { label: string; value: number; highlight?: boolean; warn?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 20, fontWeight: 700,
        color: warn ? '#f87171' : highlight ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

function NavStatRow({ icon, label, value, onClick }: { icon: string; label: string; value: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%',
        background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
        color: 'var(--text-primary)',
      }}
    >
      <span className="material-symbols-rounded" style={{ fontSize: 24, color: 'var(--primary, #7C6DFA)' }}>{icon}</span>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{label}</div>
      </div>
      <span className="material-symbols-rounded" style={{ fontSize: 18, color: 'var(--text-secondary)' }}>chevron_right</span>
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
