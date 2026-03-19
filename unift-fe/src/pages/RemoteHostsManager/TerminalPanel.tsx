import React from 'react';
import { Terminal } from '@/components/ui';
import { Icon } from './shared';
import type { UIHost } from './types';

interface TerminalPanelProps {
  sessions: UIHost[];
  terminalOpen: boolean;
  terminalMinimized: boolean;
  terminalHeight: number;
  terminalSessionId: string | undefined;
  activeSessions: UIHost[];
  onResizeMouseDown: (e: React.MouseEvent) => void;
  onSessionChange: (sessionId: string) => void;
  onClose: () => void;
  onToggleMinimize: () => void;
  onOpen: () => void;
}

export function TerminalPanel({
  sessions,
  terminalOpen,
  terminalMinimized,
  terminalHeight,
  terminalSessionId,
  activeSessions,
  onResizeMouseDown,
  onSessionChange,
  onClose,
  onToggleMinimize,
  onOpen,
}: TerminalPanelProps) {
  return (
    <>
      {/* IDE Terminal panel — visible when open and not minimized */}
      {terminalOpen && !terminalMinimized && (
        <>
          {/* Drag handle — drag up to expand, drag down to shrink */}
          <div
            className="shrink-0 h-1.5 hover:bg-[#4F8EF7]/30 cursor-ns-resize transition-colors"
            style={{ background: 'transparent' }}
            onMouseDown={onResizeMouseDown}
            title="Drag to resize terminal"
          />
          <div
            className="shrink-0 flex flex-col overflow-hidden border border-[#2E3348] rounded-t"
            style={{ height: terminalHeight }}
          >
            {/* Terminal header — host info */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-[#11141C] border-b border-[#2E3348]">
              <span className="material-symbols-outlined text-[#4F8EF7]" style={{ fontSize: '13px' }}>
                terminal
              </span>
              {terminalSessionId ? (
                <>
                  <span className="text-[11px] font-mono text-slate-300">
                    {sessions.find(s => s.sessionId === terminalSessionId)?.userAtIp ?? 'remote'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-600 ml-1">
                    ({sessions.find(s => s.sessionId === terminalSessionId)?.protocol ?? ''})
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] ml-1" title="Connected" />
                </>
              ) : (
                <span className="text-[11px] font-mono text-slate-500">No session selected</span>
              )}
            </div>

            {terminalSessionId ? (
              <Terminal
                key={terminalSessionId}
                sshSessionId={terminalSessionId}
                host={sessions.find(s => s.sessionId === terminalSessionId)?.userAtIp ?? 'remote'}
                onClose={onClose}
                onStateChange={() => {}}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-[#161923]">
                <Icon name="terminal" className="text-3xl text-slate-600" />
                <span className="text-xs font-mono text-slate-500">
                  Select an online session above to open a terminal
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Terminal tab bar — always visible at bottom */}
      <div
        className="shrink-0 h-8 flex items-center gap-1 px-2 border-t"
        style={{ background: '#161923', borderColor: '#2E3348' }}
      >
        <button
          onClick={() => terminalOpen ? onToggleMinimize() : onOpen()}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
            terminalOpen
              ? 'text-[#4F8EF7] bg-[#4F8EF7]/10'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          <Icon name="terminal" className="text-sm" />
          Terminal
          {terminalOpen && (
            <Icon name={terminalMinimized ? 'expand_less' : 'expand_more'} className="text-xs" />
          )}
        </button>

        {terminalOpen && (
          <>
            <div className="w-px h-4 bg-[#2E3348]" />
            {activeSessions.length > 0 ? (
              <select
                value={terminalSessionId}
                onChange={e => onSessionChange(e.target.value)}
                className="h-6 bg-[#1E2130] border border-[#2E3348] rounded px-2 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]/40 cursor-pointer appearance-none pr-5"
                style={{ color: '#CBD5E1' }}
              >
                {activeSessions.map(s => (
                  <option key={s.sessionId} value={s.sessionId} style={{ color: '#CBD5E1', background: '#1E2130' }}>
                    {s.userAtIp}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] font-mono text-slate-500 px-2">No active sessions</span>
            )}
          </>
        )}

        <div className="flex-1" />

        {terminalOpen && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/5 rounded transition-colors cursor-pointer"
            title="Close terminal"
          >
            <Icon name="close" className="text-slate-500 hover:text-slate-300 text-sm" />
          </button>
        )}
      </div>
    </>
  );
}
