import { Icon } from './shared';
import type { SavedHostResponse } from '@/utils/remoteConnectionAPI';
import type { UIHost } from './types';

interface SavedHostsSectionProps {
  savedHosts: SavedHostResponse[];
  activeSessions: UIHost[];
  connectingId: string | null;
  deletingId: string | null;
  onConnect: (id: string) => void;
  onDelete: (id: string) => void;
}

const AUTH_LABEL: Record<string, string> = {
  PASSWORD:               'Password',
  PRIVATE_KEY:            'SSH Key',
  PRIVATE_KEY_PASSPHRASE: 'SSH Key + Passphrase',
};

export function SavedHostsSection({
  savedHosts,
  activeSessions,
  connectingId,
  deletingId,
  onConnect,
  onDelete,
}: SavedHostsSectionProps) {
  if (savedHosts.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1 mb-3">
        <div className="flex-1 h-px bg-[#1E1E2E]" />
        <div className="flex items-center gap-2 px-2">
          <Icon name="bookmark" className="text-slate-600 text-sm" />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">
            Saved Connections
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-[#0F0F1A] border border-[#13131E] text-[10px] font-mono text-slate-600">
            {savedHosts.length}
          </span>
        </div>
        <div className="flex-1 h-px bg-[#1E1E2E]" />
      </div>

      {/* Saved host rows */}
      {savedHosts.map(host => {
        const isConnecting = connectingId === host.id;
        const isDeleting   = deletingId   === host.id;
        const displayName  = host.label ?? `${host.hostname}:${host.port}`;
        const protoLabel   = host.protocol === 'SSH_SFTP' ? 'SSH' : host.protocol;
        const isAlreadyActive = activeSessions.some(
          s =>
            s.status === 'online' &&
            s.userAtIp === `${host.username}@${host.hostname}` &&
            s.port === host.port,
        );

        return (
          <div
            key={host.id}
            className="bg-[#0F0F1A] border border-[#13131E] rounded-xl px-5 py-3.5 flex items-center gap-4 hover:border-[#252D45] transition-colors"
          >
            {/* Protocol icon */}
            <div className="w-8 h-8 rounded-lg bg-slate-800/50 border border-slate-700/30 flex items-center justify-center shrink-0">
              <Icon name="bookmark" className="text-[14px] text-slate-500" />
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-semibold text-slate-100 truncate">{displayName}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-700/30 text-[10px] font-mono text-slate-500 uppercase shrink-0">
                  {protoLabel}
                </span>
                {host.authType && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-700/30 text-[10px] font-mono text-slate-500 uppercase shrink-0">
                    {AUTH_LABEL[host.authType] ?? host.authType}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600">
                <span>{host.username}@{host.hostname}:{host.port}</span>
                {host.lastUsed && (
                  <>
                    <span className="text-[#13131E]">•</span>
                    <span>Last used {new Date(host.lastUsed).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => !isAlreadyActive && onConnect(host.id)}
                disabled={isConnecting || isDeleting || isAlreadyActive}
                title={isAlreadyActive ? 'Already connected' : 'Connect'}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
                  isAlreadyActive
                    ? 'bg-emerald-950/50 border border-emerald-800/40 text-emerald-500 cursor-not-allowed'
                    : 'brand-gradient brand-gradient-hover text-on-brand cursor-pointer disabled:opacity-50'
                }`}
              >
                <Icon
                  name={isAlreadyActive ? 'check_circle' : isConnecting ? 'hourglass_bottom' : 'play_arrow'}
                  className="text-sm"
                />
                {isAlreadyActive ? 'Active' : isConnecting ? 'Connecting...' : 'Connect'}
              </button>
              <button
                onClick={() => onDelete(host.id)}
                disabled={isConnecting || isDeleting}
                title="Remove saved connection"
                className="p-1.5 rounded-lg hover:bg-white/5 text-slate-600 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Icon name={isDeleting ? 'hourglass_bottom' : 'delete'} className="text-[15px]" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
