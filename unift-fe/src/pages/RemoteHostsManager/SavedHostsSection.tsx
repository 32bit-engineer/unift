import { Icon } from './shared';
import type { SavedHostResponse } from '@/utils/remoteConnectionAPI';

interface SavedHostsSectionProps {
  savedHosts: SavedHostResponse[];
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
  connectingId,
  deletingId,
  onConnect,
  onDelete,
}: SavedHostsSectionProps) {
  if (savedHosts.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <Icon name="bookmark" className="text-slate-500 text-sm" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Saved Connections
        </span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-[#2E3348] text-[10px] font-mono text-slate-400">
          {savedHosts.length}
        </span>
      </div>

      {/* Saved host rows */}
      {savedHosts.map(host => {
        const isConnecting = connectingId === host.id;
        const isDeleting   = deletingId   === host.id;
        const displayName  = host.label ?? `${host.hostname}:${host.port}`;

        return (
          <div
            key={host.id}
            className="bg-[#1E2130] border border-[#2E3348] rounded p-3 flex items-center gap-4 hover:border-[#3a4556] transition-colors"
          >
            {/* Protocol icon */}
            <Icon
              name="bookmark"
              className="text-xl text-slate-500 shrink-0"
            />

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-bold text-[#E2E8F0] truncate">{displayName}</span>
                <span className="px-1.5 py-0.5 rounded bg-[#2E3348] text-[10px] font-mono text-slate-400 uppercase shrink-0">
                  {host.protocol === 'SSH_SFTP' ? 'SFTP' : host.protocol}
                </span>
                {host.authType && (
                  <span className="px-1.5 py-0.5 rounded bg-[#2E3348] text-[10px] font-mono text-slate-400 uppercase shrink-0">
                    {AUTH_LABEL[host.authType] ?? host.authType}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
                <span>{host.username}@{host.hostname}:{host.port}</span>
                {host.lastUsed && (
                  <>
                    <span className="text-[#2E3348]">•</span>
                    <span>Last used {new Date(host.lastUsed).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onConnect(host.id)}
                disabled={isConnecting || isDeleting}
                title="Connect"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4F8EF7] rounded text-[10px] font-bold uppercase tracking-widest text-white font-mono hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
              >
                <Icon name={isConnecting ? 'hourglass_bottom' : 'play_arrow'} className="text-sm" />
                {isConnecting ? 'Connecting...' : 'Connect'}
              </button>
              <button
                onClick={() => onDelete(host.id)}
                disabled={isConnecting || isDeleting}
                title="Remove saved connection"
                className="p-2 hover:bg-white/5 rounded transition-colors cursor-pointer disabled:opacity-50"
              >
                <Icon name={isDeleting ? 'hourglass_bottom' : 'delete'} className="text-slate-400 hover:text-red-400 text-base" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
