// ─── SavedHostsPage ─────────────────────────────────────────────────────────
// Full-page view listing all saved host configurations.
import type { SavedHostResponse } from '@/utils/remoteConnectionAPI';

interface SavedHostsPageProps {
  savedHostConfigs:    SavedHostResponse[];
  connectingConfigId?: string | null;
  deletingConfigId?:   string | null;
  onConnect?:          (id: string) => void;
  onDelete?:           (id: string) => void;
}

// ─── Protocol badge ─────────────────────────────────────────────────────────
function ProtocolBadge({ protocol }: { protocol: string }) {
  const colorMap: Record<string, string> = {
    SFTP: 'rgba(79,142,247,0.15)',
    FTP:  'rgba(224,123,57,0.15)',
    SMB:  'rgba(74,222,128,0.12)',
  };
  const textMap: Record<string, string> = {
    SFTP: '#7c6dfa',
    FTP:  '#E07B39',
    SMB:  '#4ade80',
  };
  const bg   = colorMap[protocol.toUpperCase()] ?? 'rgba(90,99,128,0.15)';
  const text = textMap[protocol.toUpperCase()]  ?? '#5a6380';
  return (
    <span
      className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
      style={{ background: bg, color: text }}
    >
      {protocol.toUpperCase()}
    </span>
  );
}

// ─── Individual host row ─────────────────────────────────────────────────────
function HostRow({
  cfg,
  isConnecting,
  isDeleting,
  onConnect,
  onDelete,
}: {
  cfg:          SavedHostResponse;
  isConnecting: boolean;
  isDeleting:   boolean;
  onConnect?:   (id: string) => void;
  onDelete?:    (id: string) => void;
}) {
  const displayName = cfg.label ?? cfg.hostname;
  const busy = isConnecting || isDeleting;

  return (
    <div
      className="group flex items-center gap-4 px-4 py-3 rounded-lg transition-colors"
      style={{
        background:  'var(--color-surface)',
        border:      '1px solid var(--color-border-muted)',
      }}
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded flex items-center justify-center shrink-0"
        style={{ background: 'rgba(79,142,247,0.08)' }}
      >
        <span
          className="material-symbols-rounded"
          style={{
            fontSize: '18px',
            color: '#7c6dfa',
            fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20",
          }}
        >
          dns
        </span>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[13px] font-semibold text-slate-200 truncate">{displayName}</span>
          <ProtocolBadge protocol={cfg.protocol} />
        </div>
        <p className="text-[11px] text-slate-500 font-mono truncate">
          {cfg.username}@{cfg.hostname}:{cfg.port}
        </p>
      </div>

      {/* Last used */}
      <div className="shrink-0 text-right hidden sm:block">
        {cfg.lastUsed ? (
          <p className="text-[11px] text-slate-500">
            {new Date(cfg.lastUsed).toLocaleDateString()}
          </p>
        ) : (
          <p className="text-[11px] text-slate-600">Never used</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onConnect?.(cfg.id)}
          disabled={busy}
          title="Connect"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          style={{
            background: 'rgba(79,142,247,0.12)',
            color: '#7c6dfa',
          }}
        >
          <span
            className="material-symbols-rounded"
            style={{ fontSize: '13px', fontVariationSettings: "'FILL' 1" }}
          >
            {isConnecting ? 'hourglass_bottom' : 'play_arrow'}
          </span>
          {isConnecting ? 'Connecting…' : 'Connect'}
        </button>
        <button
          onClick={() => onDelete?.(cfg.id)}
          disabled={busy}
          title="Delete"
          className="w-7 h-7 flex items-center justify-center rounded transition-colors disabled:opacity-50 cursor-pointer text-slate-500 hover:text-red-400 hover:bg-red-900/20"
        >
          <span className="material-symbols-rounded" style={{ fontSize: '15px' }}>
            {isDeleting ? 'hourglass_bottom' : 'delete'}
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── SavedHostsPage ──────────────────────────────────────────────────────────
export function SavedHostsPage({
  savedHostConfigs,
  connectingConfigId = null,
  deletingConfigId   = null,
  onConnect,
  onDelete,
}: SavedHostsPageProps) {
  if (savedHostConfigs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
        <span
          className="material-symbols-rounded"
          style={{ fontSize: '48px', color: 'var(--color-primary)' }}
        >
          bookmark_border
        </span>
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-slate-300">No Saved Hosts</p>
          <p className="text-xs text-slate-500 mt-1">Connect to a host and save it to see it here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-6 overflow-y-auto h-full custom-scrollbar">
      {/* Header summary */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] text-slate-500 font-mono">
          {savedHostConfigs.length} saved {savedHostConfigs.length === 1 ? 'host' : 'hosts'}
        </p>
      </div>

      {/* Host list */}
      <div className="flex flex-col gap-2">
        {savedHostConfigs.map(cfg => (
          <HostRow
            key={cfg.id}
            cfg={cfg}
            isConnecting={connectingConfigId === cfg.id}
            isDeleting={deletingConfigId === cfg.id}
            onConnect={onConnect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
