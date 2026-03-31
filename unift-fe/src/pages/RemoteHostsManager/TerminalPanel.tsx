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
  onResizeMouseDown: (e: React.MouseEvent) => void;
  onClose: () => void;
  onToggleMinimize: () => void;
}

export function TerminalPanel({
  sessions,
  terminalOpen,
  terminalMinimized,
  terminalHeight,
  terminalSessionId,
  onResizeMouseDown,
  onClose,
  onToggleMinimize,
}: TerminalPanelProps) {
  return (
    <>
      {/* Terminal panel body — always mounted when open to keep WS session alive */}
      {terminalOpen && (
        <>
          {/* Drag handle — hidden when minimized */}
          {!terminalMinimized && (
            <div
              className="shrink-0 h-1.5 hover:bg-[#7C6DFA]/30 cursor-ns-resize transition-colors"
              style={{ background: 'transparent' }}
              onMouseDown={onResizeMouseDown}
              title="Drag to resize terminal"
            />
          )}

          {/* Panel container — height 0 hides the UI but keeps the Terminal mounted */}
          <div
            className="shrink-0 flex flex-col overflow-hidden"
            style={{
              height: terminalMinimized ? 0 : terminalHeight,
              border: terminalMinimized ? 'none' : '1px solid #1E1E2E',
              borderRadius: '4px 4px 0 0',
            }}
          >
            {/* Terminal header — host info + minimize + close */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-[#0C0C14] border-b border-[#1E1E2E]">
              <span className="material-symbols-rounded text-[#7C6DFA]" style={{ fontSize: '13px' }}>
                terminal
              </span>
              {terminalSessionId ? (
                <>
                  <span className="text-code">
                    {sessions.find(s => s.sessionId === terminalSessionId)?.userAtIp ?? 'remote'}
                  </span>
                  <span className="text-micro text-muted ml-1">
                    ({sessions.find(s => s.sessionId === terminalSessionId)?.protocol ?? ''})
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] ml-1" title="Connected" />
                </>
              ) : (
                <span className="text-meta text-muted">No session selected</span>
              )}
              <div className="flex-1" />
              {/* Minimize — collapses the panel but keeps the WS session alive */}
              <button
                onClick={onToggleMinimize}
                className="p-1 hover:bg-white/5 rounded transition-colors cursor-pointer"
                title="Minimize (session stays connected)"
              >
                <Icon name="remove" className="text-slate-500 hover:text-slate-300 text-sm" />
              </button>
              {/* Close — ends the terminal session */}
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/5 rounded transition-colors cursor-pointer"
                title="Close terminal"
              >
                <Icon name="close" className="text-slate-500 hover:text-slate-300 text-sm" />
              </button>
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
              <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-[#0F0F1A]">
                <Icon name="terminal" className="text-3xl text-slate-600" />
                <span className="text-meta text-muted">
                  Open a terminal from the file browser toolbar
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Status bar — always visible at bottom; acts as restore pill when minimized */}
      <div
        className="shrink-0 h-8 flex items-center gap-1 px-2 border-t"
        style={{ background: '#0F0F1A', borderColor: '#1E1E2E' }}
      >
        <button
          onClick={terminalOpen && terminalMinimized ? onToggleMinimize : undefined}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-micro transition-colors ${
            !terminalOpen
              ? 'text-muted cursor-default'
              : terminalMinimized
              ? 'text-secondary hover:text-primary hover:bg-white/5 cursor-pointer'
              : 'text-accent bg-[#7C6DFA]/10 cursor-default'
          }`}
        >
          <Icon name="terminal" className="text-sm" />
          Terminal
          {terminalOpen && terminalMinimized && (
            <Icon name="expand_less" className="text-xs" />
          )}
        </button>

        <div className="flex-1" />

        {/* Close button shown in status bar only when panel is minimized */}
        {terminalOpen && terminalMinimized && (
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



