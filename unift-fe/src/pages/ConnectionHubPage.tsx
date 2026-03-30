// ─── ConnectionHubPage ──────────────────────────────────────────────────────
// Infrastructure connection management hub.
// Shows SSH servers (from saved host configs) and Kubernetes clusters.
// Filters: All | SSH | K8s
import { useState } from 'react';
import type { SavedHostResponse } from '@/utils/remoteConnectionAPI';
import type { SavedHost } from '@/components/layout';

// ─── Types ──────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'ssh' | 'k8s';

type HostStatus = 'online' | 'idle' | 'offline' | 'fault';

// Placeholder shape for future Kubernetes cluster support
interface K8sCluster {
  id: string;
  name: string;
  region: string;
  version: string;
  status: 'active' | 'offline';
  nodes?: number;
  uptime?: string;
  ipRange?: string;
  provider?: string;
}

interface ConnectionHubPageProps {
  savedHostConfigs:    SavedHostResponse[];
  activeSessions:      SavedHost[];
  connectingConfigId?: string | null;
  deletingConfigId?:   string | null;
  onConnect?:          (id: string) => void;
  onDelete?:           (id: string) => void;
  onCreateNew?:        () => void;
  /** Launch Kinetic Workspace for an SSH saved-host config. */
  onLaunchWorkspace?:  (cfg: SavedHostResponse) => void;
  /** Navigate directly to an active session's workspace. */
  onOpenWorkspace?:    (sessionId: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function deriveHostStatus(cfg: SavedHostResponse, activeSessions: SavedHost[]): HostStatus {
  const displayName = cfg.label ?? cfg.hostname;
  const match = activeSessions.find(
    s => s.label === displayName || s.label === cfg.hostname,
  );
  if (!match) return 'idle';
  if (match.status === 'online') return 'online';
  if (match.status === 'warning') return 'fault';
  return 'offline';
}

function getRegionFromHostname(hostname: string): string {
  if (/local|127\.|10\.|192\.168/.test(hostname)) return 'Local';
  if (/asia|ap-/.test(hostname.toLowerCase())) return 'Asia-SE';
  if (/eu-|europe/.test(hostname.toLowerCase())) return 'EU-West';
  return 'US-East';
}

// ─── Status Badge ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<HostStatus | 'active', { dot: string; text: string }> = {
  online:  { dot: '#4ade80', text: '#4ade80' },
  idle:    { dot: '#9090B0', text: '#9090B0' },
  offline: { dot: '#f87171', text: '#f87171' },
  fault:   { dot: '#f87171', text: '#f87171' },
  active:  { dot: '#4ade80', text: '#4ade80' },
};

const STATUS_LABELS: Record<HostStatus | 'active', string> = {
  online:  'ONLINE',
  idle:    'IDLE',
  offline: 'OFFLINE',
  fault:   'FAULT',
  active:  'ACTIVE',
};

function StatusBadge({ status }: { status: HostStatus | 'active' }) {
  const cfg = STATUS_COLORS[status];
  return (
    <span
      className="flex items-center gap-1.5 text-[10px] font-mono font-semibold"
      style={{ color: cfg.text }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: cfg.dot }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── K8s Server Icon ─────────────────────────────────────────────────────────

function K8sIcon() {
  return (
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: 'rgba(124,109,250,0.1)', border: '1px solid rgba(124,109,250,0.18)' }}
    >
      {/* Stacked-rectangles representation of a cluster */}
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3"  y="3"  width="14" height="4" rx="1" fill="rgba(124,109,250,0.9)" />
        <rect x="3"  y="8"  width="14" height="4" rx="1" fill="rgba(124,109,250,0.6)" />
        <rect x="3"  y="13" width="14" height="4" rx="1" fill="rgba(124,109,250,0.35)" />
      </svg>
    </div>
  );
}

// ─── SSH Server Icon ──────────────────────────────────────────────────────────

function SshIcon() {
  return (
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: 'rgba(124,109,250,0.08)', border: '1px solid rgba(124,109,250,0.12)' }}
    >
      <span
        className="material-symbols-rounded"
        style={{
          fontSize: '20px',
          color: '#7C6DFA',
          fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
        }}
      >
        computer
      </span>
    </div>
  );
}

// ─── K8s Cluster Card ─────────────────────────────────────────────────────────

function K8sClusterCard({
  cluster,
}: {
  cluster: K8sCluster;
}) {
  const isActive = cluster.status === 'active';

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-xl"
      style={{
        background:  'var(--color-surface)',
        border:      '1px solid var(--color-border-muted)',
        minWidth:    '260px',
        flex:        '1 1 260px',
        maxWidth:    '320px',
      }}
    >
      {/* Top row: icon + status */}
      <div className="flex items-start justify-between">
        <K8sIcon />
        <StatusBadge status={isActive ? 'active' : 'offline'} />
      </div>

      {/* Name + region/version */}
      <div>
        <p className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {cluster.name}
        </p>
        <p className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {cluster.region} &bull; {cluster.version}
        </p>
      </div>

      {/* Stats grid */}
      <div
        className="grid grid-cols-2 gap-2 rounded-lg p-3"
        style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}
      >
        {isActive ? (
          <>
            <div>
              <p className="label text-muted" style={{ fontSize: '10px' }}>Nodes</p>
              <p className="text-[13px] font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                {cluster.nodes ?? 0} Active
              </p>
            </div>
            <div>
              <p className="label text-muted" style={{ fontSize: '10px' }}>Uptime</p>
              <p className="text-[13px] font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                {cluster.uptime ?? 'N/A'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="label text-muted" style={{ fontSize: '10px' }}>IP Range</p>
              <p className="text-[13px] font-semibold mt-0.5 font-mono" style={{ color: 'var(--color-text-primary)' }}>
                {cluster.ipRange ?? 'N/A'}
              </p>
            </div>
            <div>
              <p className="label text-muted" style={{ fontSize: '10px' }}>Provider</p>
              <p className="text-[13px] font-semibold mt-0.5 font-mono" style={{ color: 'var(--color-text-primary)' }}>
                {cluster.provider ?? 'N/A'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto">
        <button
          className="flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150 cursor-pointer"
          style={
            isActive
              ? { background: 'var(--gradient-primary)', color: '#fff' }
              : { background: 'var(--color-surface-alt)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-muted)' }
          }
        >
          {isActive ? 'Connect' : 'Retry'}
        </button>

        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer hover:bg-white/5"
          style={{ border: '1px solid var(--color-border-muted)' }}
          title="Edit"
        >
          <span className="material-symbols-rounded" style={{ fontSize: '15px', color: 'var(--color-text-muted)' }}>
            edit
          </span>
        </button>

        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer hover:bg-red-900/20"
          style={{ border: '1px solid var(--color-border-muted)' }}
          title="Delete"
        >
          <span className="material-symbols-rounded" style={{ fontSize: '15px', color: 'var(--color-text-muted)' }}>
            delete
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── SSH Server Card ──────────────────────────────────────────────────────────

function SshServerCard({
  cfg,
  status,
  isConnecting,
  isDeleting,
  activeSessionId,
  onLaunchWorkspace,
  onOpenWorkspace,
  onDelete,
}: {
  cfg:                 SavedHostResponse;
  status:              HostStatus;
  isConnecting:        boolean;
  isDeleting:          boolean;
  activeSessionId?:    string | null;
  onLaunchWorkspace?:  (cfg: SavedHostResponse) => void;
  onOpenWorkspace?:    (sessionId: string) => void;
  onDelete?:           (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = cfg.label ?? cfg.hostname;
  const region = getRegionFromHostname(cfg.hostname);
  const busy = isConnecting || isDeleting;
  const isFault = status === 'fault';
  const isActive = status === 'online' && !!activeSessionId;

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-xl relative"
      style={{
        background:  'var(--color-surface)',
        border:      '1px solid var(--color-border-muted)',
        minWidth:    '220px',
        flex:        '1 1 220px',
        maxWidth:    '280px',
      }}
    >
      {/* Top row: icon + status */}
      <div className="flex items-start justify-between">
        <SshIcon />
        <StatusBadge status={status} />
      </div>

      {/* Name + address */}
      <div>
        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
          {displayName}
        </p>
        <p className="text-[11px] font-mono mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
          {cfg.hostname} &bull; {region}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto">
        {isActive ? (
          <button
            onClick={() => onOpenWorkspace?.(activeSessionId!)}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all duration-150 cursor-pointer"
            style={{
              background: 'var(--gradient-primary)',
              color: '#fff',
            }}
          >
            Open Workspace
          </button>
        ) : (
          <button
            onClick={() => !isFault && onLaunchWorkspace?.(cfg)}
            disabled={busy}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all duration-150 cursor-pointer disabled:opacity-50"
            style={{
              background: 'var(--color-surface-alt)',
              color:      isFault ? '#f87171' : 'var(--color-text-secondary)',
              border:     `1px solid ${isFault ? 'rgba(248,113,113,0.25)' : 'var(--color-border-muted)'}`,
            }}
          >
            {isConnecting ? 'Connecting…' : isFault ? 'Diagnose' : 'Connect'}
          </button>
        )}

        {/* Three-dot menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(p => !p)}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer hover:bg-white/5"
            style={{ border: '1px solid var(--color-border-muted)' }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: '18px', color: 'var(--color-text-muted)' }}>
              more_vert
            </span>
          </button>

          {menuOpen && (
            <>
              {/* Click-outside backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div
                className="absolute right-0 bottom-full mb-1 z-20 rounded-lg py-1 min-w-[130px]"
                style={{
                  background: 'var(--color-surface-alt)',
                  border:     '1px solid var(--color-border-muted)',
                  boxShadow:  '0 8px 24px rgba(0,0,0,0.45)',
                }}
              >
                <button
                  onClick={() => { onLaunchWorkspace?.(cfg); setMenuOpen(false); }}
                  disabled={busy}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-left hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>play_arrow</span>
                  Connect
                </button>
                <button
                  onClick={() => { onDelete?.(cfg.id); setMenuOpen(false); }}
                  disabled={busy}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-left hover:bg-red-900/20 transition-colors cursor-pointer disabled:opacity-50"
                  style={{ color: isDeleting ? 'var(--color-text-muted)' : '#f87171' }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
                    {isDeleting ? 'hourglass_bottom' : 'delete'}
                  </span>
                  {isDeleting ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Create New Connection Card ───────────────────────────────────────────────

function CreateNewCard({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl cursor-pointer transition-all duration-150 hover:bg-white/3 group"
      style={{
        border:      '1.5px dashed var(--color-border-bright)',
        minWidth:    '220px',
        flex:        '1 1 220px',
        maxWidth:    '280px',
        minHeight:   '180px',
        background:  'transparent',
      }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors"
        style={{
          background: 'var(--color-surface-alt)',
          border:     '1px solid var(--color-border-muted)',
        }}
      >
        <span
          className="material-symbols-rounded"
          style={{ fontSize: '24px', color: 'var(--color-text-muted)' }}
        >
          add
        </span>
      </div>
      <div className="text-center">
        <p
          className="text-[13px] font-semibold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Create New Connection
        </p>
        <p
          className="text-[11px] mt-1 leading-relaxed"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Instantly provision SSH nodes or<br /> import cluster manifests
        </p>
      </div>
    </button>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  iconIsSvg = false,
  label,
}: {
  icon: string;
  iconIsSvg?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      {iconIsSvg ? (
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <rect x="3"  y="3"  width="14" height="4" rx="1" fill="rgba(90,99,128,0.8)" />
            <rect x="3"  y="8"  width="14" height="4" rx="1" fill="rgba(90,99,128,0.55)" />
            <rect x="3"  y="13" width="14" height="4" rx="1" fill="rgba(90,99,128,0.3)" />
          </svg>
        </span>
      ) : (
        <span
          className="material-symbols-rounded"
          style={{
            fontSize: '16px',
            color: '#5a6380',
            fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20",
          }}
        >
          {icon}
        </span>
      )}
      <span className="label" style={{ color: '#5a6380', letterSpacing: '0.12em' }}>
        {label}
      </span>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptySection({ message }: { message: string }) {
  return (
    <div
      className="flex items-center justify-center h-20 rounded-xl"
      style={{
        border:     '1px dashed var(--color-border-subtle)',
        background: 'rgba(255,255,255,0.01)',
      }}
    >
      <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        {message}
      </p>
    </div>
  );
}

// ─── Filter Tab ───────────────────────────────────────────────────────────────

function FilterTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded text-[12px] font-medium transition-all duration-150 cursor-pointer"
      style={
        active
          ? { background: 'var(--color-surface-alt)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-bright)' }
          : { background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid transparent' }
      }
    >
      {label}
    </button>
  );
}

// ─── ConnectionHubPage ────────────────────────────────────────────────────────

export function ConnectionHubPage({
  savedHostConfigs    = [],
  activeSessions      = [],
  connectingConfigId  = null,
  deletingConfigId    = null,
  onConnect: _onConnect,
  onDelete,
  onCreateNew,
  onLaunchWorkspace,
  onOpenWorkspace,
}: ConnectionHubPageProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  // No real K8s data yet — placeholder list
  const k8sClusters: K8sCluster[] = [];

  const showK8s = filter === 'all' || filter === 'k8s';
  const showSsh = filter === 'all' || filter === 'ssh';

  // Map saved host configs to their active session IDs (if connected)
  const findActiveSessionId = (cfg: SavedHostResponse): string | null => {
    const displayName = cfg.label ?? cfg.hostname;
    const match = activeSessions.find(
      s => s.status === 'online' && (s.label === displayName || s.label === cfg.hostname),
    );
    return match?.id ?? null;
  };

  // Active sessions that can be opened — shown in their own section
  const onlineSessions = activeSessions.filter(s => s.status === 'online');

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
      <div className="flex-1 p-6 max-w-6xl w-full mx-auto">

        {/* Page title + filters */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-display mb-1">Connection Hub</h1>
            <p className="text-ui-sm" style={{ color: 'var(--color-text-secondary)', maxWidth: '480px' }}>
              Manage and orchestrate your remote infrastructure across SSH nodes and managed Kubernetes clusters.
            </p>
          </div>

          {/* Filter tabs */}
          <div
            className="flex items-center gap-1 shrink-0 p-1 rounded-lg"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
          >
            <FilterTab label="All"  active={filter === 'all'}  onClick={() => setFilter('all')}  />
            <FilterTab label="SSH"  active={filter === 'ssh'}  onClick={() => setFilter('ssh')}  />
            <FilterTab label="K8s"  active={filter === 'k8s'}  onClick={() => setFilter('k8s')}  />
          </div>
        </div>

        {/* Active Sessions — shown when there are online sessions */}
        {onlineSessions.length > 0 && (
          <section className="mb-10">
            <SectionHeader icon="play_circle" label="Active Sessions" />
            <div className="flex flex-wrap gap-3">
              {onlineSessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => onOpenWorkspace?.(session.id)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-150 cursor-pointer hover:scale-[1.01]"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid rgba(74,222,128,0.25)',
                    minWidth: '220px',
                    flex: '0 1 280px',
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.18)' }}
                  >
                    <span
                      className="material-symbols-rounded"
                      style={{ fontSize: '18px', color: '#4ade80', fontVariationSettings: "'FILL' 1, 'wght' 400" }}
                    >
                      terminal
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {session.label}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#4ade80' }}>
                      Connected — Click to open workspace
                    </p>
                  </div>
                  <span
                    className="material-symbols-rounded shrink-0"
                    style={{ fontSize: '18px', color: 'var(--color-text-muted)', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                  >
                    arrow_forward
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {showK8s && (
          <section className="mb-10">
            <SectionHeader icon="" iconIsSvg label="Kubernetes Clusters" />

            {k8sClusters.length === 0 ? (
              <div className="flex flex-wrap gap-4">
                <EmptySection message="No Kubernetes clusters configured yet." />
                <CreateNewCard onClick={onCreateNew} />
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                {k8sClusters.map(cluster => (
                  <K8sClusterCard key={cluster.id} cluster={cluster} />
                ))}
                <CreateNewCard onClick={onCreateNew} />
              </div>
            )}
          </section>
        )}

        {/* SSH Servers */}
        {showSsh && (
          <section className="mb-10">
            <SectionHeader icon="terminal" label="SSH Servers" />

            {savedHostConfigs.length === 0 ? (
              <div className="flex flex-wrap gap-4">
                <EmptySection message="No SSH servers saved yet." />
                <CreateNewCard onClick={onCreateNew} />
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                {savedHostConfigs.map(cfg => (
                  <SshServerCard
                    key={cfg.id}
                    cfg={cfg}
                    status={deriveHostStatus(cfg, activeSessions)}
                    isConnecting={connectingConfigId === cfg.id}
                    isDeleting={deletingConfigId === cfg.id}
                    activeSessionId={findActiveSessionId(cfg)}
                    onLaunchWorkspace={onLaunchWorkspace}
                    onOpenWorkspace={onOpenWorkspace}
                    onDelete={onDelete}
                  />
                ))}
                <CreateNewCard onClick={onCreateNew} />
              </div>
            )}
          </section>
        )}

      </div>
    </div>
  );
}
