import React from 'react';
import type { UIHost } from './types';

interface HostGridViewProps {
  hosts: UIHost[];
  loading: boolean;
  onBrowse: (host: UIHost) => void;
  onDisconnect: (sessionId: string) => void;
}

export function HostGridView({ hosts, loading, onBrowse, onDisconnect }: HostGridViewProps) {
  if (loading) {
    return (
      <div className="col-span-full text-center text-ui-sm py-8">
        Loading sessions...
      </div>
    );
  }

  if (hosts.length === 0) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center py-20 gap-4 opacity-50">
        <span className="material-symbols-rounded text-5xl text-slate-500">lan</span>
        <div className="text-center">
          <p className="label">No connections</p>
          <p className="text-ui-sm text-muted mt-1">Click &ldquo;New Connection&rdquo; to get started</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {hosts.map(host => {
        const isOnline       = host.status === 'online';
        const isWarning      = host.status === 'warning';
        const accentColor    = isOnline ? '#7C6DFA' : isWarning ? '#E07B39' : '#3a4556';
        const protocolLabel  = host.protocol === 'SSH_SFTP' ? 'SFTP' : host.protocol;
        const protocolIcon   = host.protocol === 'SSH_SFTP' ? 'dns' : host.protocol === 'FTP' ? 'cloud_upload' : 'storage';

        return (
          <div
            key={host.sessionId}
            onClick={() => isOnline && onBrowse(host)}
            className={`group relative flex flex-col rounded overflow-hidden transition-all duration-200 ${
              isOnline ? 'cursor-pointer hover:-translate-y-px' : 'opacity-55 cursor-default'
            }`}
            style={{
              background:  'var(--color-surface)',
              border:      '1px solid var(--color-border-muted)',
              boxShadow:   isOnline ? '0 2px 12px rgba(0,0,0,0.35)' : '0 1px 4px rgba(0,0,0,0.2)',
              ...(isOnline && {
                '--tw-shadow-color': 'rgba(79,142,247,0.08)',
              } as React.CSSProperties),
            }}
          >
            {/* Accent top bar */}
            <div className="h-0.5 w-full shrink-0" style={{ background: accentColor }} />

            {/* Card body */}
            <div className="p-4 flex flex-col gap-4 flex-1">

              {/* Row 1 — icon + identity */}
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded flex items-center justify-center shrink-0"
                  style={{ background: isOnline ? 'rgba(79,142,247,0.1)' : 'rgba(255,255,255,0.04)' }}
                >
                  <span
                    className="material-symbols-rounded"
                    style={{
                      fontSize: '18px',
                      color: isOnline ? '#7C6DFA' : '#5a6380',
                      fontVariationSettings: isOnline
                        ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                        : "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
                    }}
                  >
                    {protocolIcon}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-title truncate leading-tight">
                    {host.name.split(':')[0]}
                  </p>
                  <p className="text-meta text-muted mt-0.5 truncate">
                    {host.userAtIp}
                  </p>
                </div>
                {/* Status dot */}
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: accentColor }}
                  title={host.status}
                />
              </div>

              {/* Row 2 — meta chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="px-2 py-0.5 rounded text-micro"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#93a3b8' }}
                >
                  {protocolLabel}
                </span>
                <span
                  className="px-2 py-0.5 rounded text-micro"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#93a3b8' }}
                >
                  :{host.port}
                </span>
                {host.latency > 0 && (
                  <span
                    className="px-2 py-0.5 rounded text-meta"
                    style={{
                      background: host.latency > 100 ? 'rgba(224,123,57,0.12)' : 'rgba(74,222,128,0.1)',
                      color:      host.latency > 100 ? '#E07B39' : '#4ade80',
                    }}
                  >
                    {host.latency}ms
                  </span>
                )}
              </div>

              {/* Row 3 — last connected */}
              <div className="flex items-center gap-1.5 mt-auto">
                <span
                  className="material-symbols-rounded"
                  style={{ fontSize: '13px', color: '#5a6380' }}
                >
                  schedule
                </span>
                <span className="text-meta text-muted">{host.lastConnected}</span>
              </div>
            </div>

            {/* Card footer — actions */}
            <div
              className="flex items-center justify-between px-4 py-2.5 shrink-0"
              style={{ borderTop: '1px solid var(--color-border-muted)' }}
              onClick={e => e.stopPropagation()}
            >
              {isOnline ? (
                <button
                  onClick={() => onBrowse(host)}
                  className="flex items-center gap-1.5 text-micro transition-colors cursor-pointer"
                  style={{ color: '#7C6DFA' }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
                    folder_open
                  </span>
                  Browse
                </button>
              ) : (
                <span className="text-micro text-muted">
                  {host.status}
                </span>
              )}
              <button
                onClick={() => onDisconnect(host.sessionId)}
                className="p-1 rounded transition-colors cursor-pointer hover:bg-red-900/20"
                title="Disconnect"
              >
                <span className="material-symbols-rounded" style={{ fontSize: '14px', color: '#5a6380' }}>
                  close
                </span>
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
