/**
 * Kubernetes Nodes — Card-based inventory of cluster nodes showing
 * status, roles, version, resource capacity, and cluster health summary.
 *
 * Design reference: designs/unift/k8s_nodes_inventory/screen.png
 *
 * Data source: K8sController.listNodes
 * via remoteConnectionAPI.listK8sNodes
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { K8sNode } from '@/utils/remoteConnectionAPI';
import { K8sYamlModal } from './K8sYamlModal';
import type { YamlModalTarget } from './K8sYamlModal';

interface K8sNodesPageProps {
  sessionId: string;
}

export function K8sNodesPage({ sessionId }: K8sNodesPageProps) {
  const [nodes, setNodes] = useState<K8sNode[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yamlModal, setYamlModal] = useState<YamlModalTarget | null>(null);

  const fetchNodes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await remoteConnectionAPI.listK8sNodes(sessionId);
      setNodes(res.nodes);
      setTotal(res.total);
    } catch {
      setError('Failed to load nodes.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  const counts = useMemo(() => {
    const ready = nodes.filter((n) => n.status === 'Ready').length;
    return { ready, unhealthy: nodes.length - ready };
  }, [nodes]);

  if (loading && nodes.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        <span className="material-symbols-rounded" style={{ fontSize: 28, marginRight: 10, animation: 'spin 1s linear infinite' }}>progress_activity</span>
        Loading nodes...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <span className="material-symbols-rounded" style={{ fontSize: 40, color: '#f87171' }}>error</span>
        <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>
        <button onClick={fetchNodes} style={{ padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 22, overflow: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Infrastructure Nodes</h2>
            <span style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: counts.unhealthy === 0 ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
              color: counts.unhealthy === 0 ? '#4ade80' : '#f87171',
            }}>
              {counts.unhealthy === 0 ? 'ALL SYSTEMS NORMAL' : `${counts.unhealthy} UNHEALTHY`}
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Resource allocation and node health across the cluster
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#4ade80' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} />
            Ready: {counts.ready}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#f87171' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f87171' }} />
            Unhealthy: {counts.unhealthy}
          </span>
          <button
            onClick={fetchNodes}
            style={{ display: 'flex', alignItems: 'center', padding: 6, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            title="Refresh"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 20 }}>refresh</span>
          </button>
        </div>
      </div>

      {/* Main grid: node cards + cluster health sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 340px', gap: 16 }}>
        {/* Featured node cards (first 2, larger) */}
        {nodes.slice(0, 2).map((node) => (
          <FeaturedNodeCard
            key={node.name}
            node={node}
            onViewYaml={() => setYamlModal({ kind: 'Node', namespace: '', name: node.name, readOnly: true })}
          />
        ))}

        {/* Cluster health card */}
        <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h4 style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-secondary)', margin: 0 }}>
            Total Cluster Health
          </h4>
          <div style={{ fontSize: 36, fontWeight: 700, color: counts.unhealthy === 0 ? '#4ade80' : '#facc15' }}>
            {total > 0 ? ((counts.ready / total) * 100).toFixed(1) : 0}%
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div>
              <div style={{ fontWeight: 600, letterSpacing: 0.5 }}>UPTIME</div>
              <div style={{ color: 'var(--text-primary)', marginTop: 2 }}>—</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, letterSpacing: 0.5 }}>VERSION</div>
              <div style={{ color: 'var(--text-primary)', marginTop: 2 }}>{nodes[0]?.version || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Remaining node cards (compact) */}
      {nodes.length > 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {nodes.slice(2).map((node) => (
            <CompactNodeCard
              key={node.name}
              node={node}
              onViewYaml={() => setYamlModal({ kind: 'Node', namespace: '', name: node.name, readOnly: true })}
            />
          ))}
        </div>
      )}

      {/* Footer cluster info */}
      <div style={{
        display: 'flex', gap: 24, padding: '14px 20px',
        background: 'var(--bg-card, #1b1b23)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)',
      }}>
        <span>Total Nodes: <strong style={{ color: 'var(--text-primary)' }}>{total}</strong></span>
        <span>Ready: <strong style={{ color: '#4ade80' }}>{counts.ready}</strong></span>
        <span>Architectures: <strong style={{ color: 'var(--text-primary)' }}>
          {[...new Set(nodes.map((n) => n.architecture).filter(Boolean))].join(', ') || '—'}
        </strong></span>
        <span>OS: <strong style={{ color: 'var(--text-primary)' }}>
          {[...new Set(nodes.map((n) => n.osImage).filter(Boolean))].slice(0, 2).join(', ') || '—'}
        </strong></span>
      </div>

      {/* YAML Viewer Modal — nodes are cluster-scoped, always read-only */}
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

function FeaturedNodeCard({ node, onViewYaml }: { node: K8sNode; onViewYaml: () => void }) {
  const ready = node.status === 'Ready';
  return (
    <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 12, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 28, color: 'var(--primary, #7C6DFA)' }}>dns</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{node.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
              {node.internalIp || node.roles || '—'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onViewYaml}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'rgba(124,109,250,0.1)', color: '#7C6DFA',
              fontSize: 11, fontWeight: 600,
            }}
            title="View YAML"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 14, fontVariationSettings: "'FILL' 0, 'wght' 300" }}>description</span>
            View YAML
          </button>
          <span style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: ready ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
            color: ready ? '#4ade80' : '#f87171',
          }}>
            {ready ? 'READY' : 'NOT READY'}
          </span>
        </div>
      </div>

      {/* Resource bars */}
      <div>
        <ResourceBar label="CPU Capacity" value={node.cpuCapacity || '—'} />
        <div style={{ height: 8 }} />
        <ResourceBar label="Memory" value={node.memoryCapacity || '—'} />
      </div>

      {/* Metadata */}
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)' }}>
        {node.version && <span>v{node.version}</span>}
        {node.architecture && <span>{node.architecture}</span>}
        {node.roles && <span>{node.roles}</span>}
      </div>
    </div>
  );
}

function CompactNodeCard({ node, onViewYaml }: { node: K8sNode; onViewYaml: () => void }) {
  const ready = node.status === 'Ready';
  return (
    <div style={{ background: 'var(--bg-card, #1b1b23)', borderRadius: 10, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{node.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onViewYaml}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'rgba(124,109,250,0.1)', color: '#7C6DFA',
            }}
            title="View YAML"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 13, fontVariationSettings: "'FILL' 0, 'wght' 300" }}>description</span>
          </button>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: ready ? '#4ade80' : '#f87171' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>CPU</span>
          <span style={{ color: 'var(--text-primary)' }}>{node.cpuCapacity || '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>MEM</span>
          <span style={{ color: 'var(--text-primary)' }}>{node.memoryCapacity || '—'}</span>
        </div>
      </div>
    </div>
  );
}

function ResourceBar({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{value}</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
        <div style={{ height: '100%', borderRadius: 3, width: '50%', background: 'var(--primary, #7C6DFA)' }} />
      </div>
    </div>
  );
}
