import { Icon, Badge } from './shared';
import type { UIHost } from './types';

interface HostListViewProps {
  hosts: UIHost[];
  loading: boolean;
  onBrowse: (host: UIHost) => void;
  onDisconnect: (sessionId: string) => void;
}

function getStatusBadgeInfo(status: 'online' | 'offline' | 'warning') {
  const map = {
    online:  { label: 'ONLINE',       variant: 'active'  as const, icon: 'check_circle' },
    offline: { label: 'OFFLINE',      variant: 'warning' as const, icon: 'cancel' },
    warning: { label: 'HIGH LATENCY', variant: 'warning' as const, icon: 'warning' },
  };
  return map[status];
}

export function HostListView({ hosts, loading, onBrowse, onDisconnect }: HostListViewProps) {
  if (loading) {
    return <div className="text-center text-slate-400 py-8">Loading sessions...</div>;
  }

  if (hosts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
        <Icon name="lan" className="text-5xl text-slate-500" />
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-slate-400">No connections</p>
          <p className="text-xs text-slate-600 mt-1">Click &ldquo;New Connection&rdquo; to get started</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {hosts.map(host => {
        const statusInfo = getStatusBadgeInfo(host.status);
        return (
          <div
            key={host.sessionId}
            onClick={() => host.status === 'online' && onBrowse(host)}
            className={`bg-[#1E2130] border border-[#2E3348] rounded p-3 transition-colors ${
              host.status === 'online'
                ? 'hover:bg-[#242a3a] hover:border-[#4F8EF7]/40 cursor-pointer'
                : 'opacity-60 cursor-default'
            }`}
          >
            {/* Host Row */}
            <div className="flex items-center gap-4 mb-1.5">
              <Icon
                name={host.protocol === 'SSH_SFTP' ? 'folder_open' : host.protocol === 'FTP' ? 'cloud_upload' : 'storage'}
                className={`text-xl ${host.status === 'online' ? 'text-[#4F8EF7]' : 'text-slate-500'}`}
                filled={host.status === 'online'}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="text-sm font-bold text-[#E2E8F0] truncate">{host.name}</h4>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>
                <div className="text-xs font-mono text-slate-500">{host.userAtIp}</div>
              </div>
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                {host.status === 'online' && (
                  <button
                    onClick={() => onBrowse(host)}
                    className="p-2 hover:bg-white/5 rounded transition-colors cursor-pointer"
                    title="Browse files"
                  >
                    <Icon name="folder_open" className="text-[#4F8EF7] text-base" />
                  </button>
                )}
                <button
                  onClick={() => onDisconnect(host.sessionId)}
                  className="p-2 hover:bg-white/5 rounded transition-colors cursor-pointer"
                  title="Disconnect"
                >
                  <Icon name="close" className="text-slate-400 hover:text-red-400 text-base" />
                </button>
              </div>
            </div>

            {/* Host Details */}
            <div className="grid grid-cols-4 gap-4 text-xs pl-10 pr-4">
              <div>
                <span className="label block mb-1">Protocol</span>
                <span className="text-slate-300">{host.protocol}:{host.port}</span>
              </div>
              <div>
                <span className="label block mb-1">Last Connected</span>
                <span className="text-slate-300">{host.lastConnected}</span>
              </div>
              <div>
                <span className="label block mb-1">Latency</span>
                <span className={host.latency > 100 ? 'text-[#E07B39]' : 'text-[#4ade80]'}>
                  {host.latency}ms
                </span>
              </div>
              <div>
                <span className="label block mb-1">Status</span>
                <span className={`font-mono ${
                  host.status === 'online' ? 'text-[#4ade80]' :
                  host.status === 'warning' ? 'text-[#E07B39]' : 'text-slate-500'
                }`}>
                  {host.status.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
