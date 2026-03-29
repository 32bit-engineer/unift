import { Icon } from './shared';
import type { UIHost } from './types';

interface HostListViewProps {
  hosts: UIHost[];
  loading: boolean;
  onBrowse: (host: UIHost) => void;
  onDisconnect: (sessionId: string) => void;
  onAnalytics: (host: UIHost) => void;
}

const PROTOCOL_ICON: Record<string, string> = {
  SSH_SFTP: 'terminal',
  FTP:      'cloud_upload',
  SMB:      'storage',
};

const PROTOCOL_LABEL: Record<string, string> = {
  SSH_SFTP: 'SSH',
  FTP:      'FTP',
  SMB:      'SMB',
};

function StatusPill({ status }: { status: UIHost['status'] }) {
  if (status === 'online') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro bg-emerald-950/70 text-emerald-400 border border-emerald-800/40">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#4ade80]" />
        ONLINE
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro bg-amber-950/60 text-amber-400 border border-amber-800/40">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        WARNING
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro bg-slate-800/50 text-muted border border-slate-700/30">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
      CLOSED
    </span>
  );
}

export function HostListView({ hosts, loading, onBrowse, onDisconnect, onAnalytics }: HostListViewProps) {
  if (loading) {
    return (
      <div className="text-center text-secondary py-12 text-code">
        Loading sessions...
      </div>
    );
  }

  if (hosts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#0F0F1A] border border-[#13131E] flex items-center justify-center mb-1">
          <Icon name="lan" className="text-2xl text-slate-600" />
        </div>
        <p className="text-title">No active sessions</p>
        <p className="text-ui-sm text-muted">Click &ldquo;New Session&rdquo; to establish a connection</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#13131E]">
      {/* Table Header */}
      <div className="grid grid-cols-[2fr_140px_90px_170px_140px] gap-4 px-5 py-3 bg-[#0C1020] border-b border-[#13131E]">
        {(['NAME', 'STATUS', 'TYPE', 'DURATION / LAST SEEN', 'ACTIONS'] as const).map(col => (
          <span key={col} className="label text-muted">
            {col}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#1E1E2E]">
        {hosts.map(host => {
          const iconName   = PROTOCOL_ICON[host.protocol] ?? 'dns';
          const protoLabel = PROTOCOL_LABEL[host.protocol] ?? host.protocol;
          const isOnline   = host.status === 'online';

          return (
            <div
              key={host.sessionId}
              className={`grid grid-cols-[2fr_140px_90px_170px_140px] gap-4 items-center px-5 py-3.5 bg-[#0F0F1A] transition-colors ${
                isOnline
                  ? 'hover:bg-[#111828] cursor-pointer'
                  : 'opacity-55 cursor-default'
              }`}
              onClick={() => isOnline && onBrowse(host)}
            >
              {/* NAME */}
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isOnline
                    ? 'bg-slate-800/70 border border-slate-700/50'
                    : 'bg-slate-800/30 border border-slate-800/30'
                }`}>
                  <Icon
                    name={iconName}
                    className={`text-[15px] ${isOnline ? 'text-[#7C6DFA]' : 'text-slate-600'}`}
                    filled={isOnline}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-title truncate leading-tight">
                    {host.name.split(':')[0]}
                  </p>
                  <p className="text-meta text-muted truncate mt-0.5">
                    {host.userAtIp}
                  </p>
                </div>
              </div>

              {/* STATUS */}
              <div>
                <StatusPill status={host.status} />
              </div>

              {/* TYPE */}
              <span className={`text-meta ${
                isOnline ? 'text-sky-400' : 'text-muted'
              }`}>
                {protoLabel}
              </span>

              {/* DURATION / LAST SEEN */}
              <span className="text-meta">
                {host.lastConnected}
              </span>

              {/* ACTIONS */}
              <div
                className="flex items-center gap-1.5"
                onClick={e => e.stopPropagation()}
              >
                {isOnline ? (
                  <>
                    <button
                      onClick={() => onAnalytics(host)}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-violet-400 transition-colors cursor-pointer"
                      title="Session analytics"
                    >
                      <Icon name="monitoring" className="text-[15px]" />
                    </button>
                    <button
                      onClick={() => onBrowse(host)}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
                      title="Browse files"
                    >
                      <Icon name="folder_open" className="text-[15px]" />
                    </button>
                    <button
                      onClick={() => onDisconnect(host.sessionId)}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                      title="Disconnect"
                    >
                      <Icon name="close" className="text-[15px]" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onDisconnect(host.sessionId)}
                    className="px-3 py-1.5 text-micro rounded-lg border border-[#252D45] text-muted hover:border-slate-600 hover:text-secondary transition-colors cursor-pointer"
                  >
                    REMOVE
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

