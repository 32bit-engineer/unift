import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Terminal } from '@/components/ui/Terminal';
import type { TerminalState } from '@/types/terminal';
import type { UIHost } from './RemoteHostsManagerPage';

interface TerminalPageProps {
  sessions?: UIHost[];
  sshSessionId?: string;
  host?: string;
  isEmbedded?: boolean;
}

/**
 * TerminalPage: Terminal session viewer with session selection.
 * 
 * Can be used in two modes:
 * - Embedded (in HomePage): isEmbedded=true, renders without extra wrappers
 * - Standalone: (future) full-screen mode with navigation
 */
export function TerminalPage({
  sessions = [],
  sshSessionId: initialSessionId,
  host: initialHost,
  isEmbedded = true,
}: TerminalPageProps) {
  const [terminalState, setTerminalState] = useState<TerminalState>('connecting');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSessionId || (sessions.length > 0 ? sessions[0].sessionId : null)
  );
  const [terminalHeight, setTerminalHeight] = useState<number>(320);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSessionChange = useCallback((newSessionId: string) => {
    if (newSessionId === selectedSessionId) return;
    // Reset state before mounting the new Terminal — the key change handles teardown
    setTerminalState('connecting');
    setSelectedSessionId(newSessionId);
  }, [selectedSessionId]);

  // Handle mouse drag to resize terminal
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const newHeight = e.clientY - rect.top;
      
      // Constrain height between min (150px) and max (90% of container)
      const minHeight = 150;
      const maxHeight = Math.max(300, container.clientHeight * 0.9);
      
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setTerminalHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  // Find selected session details
  const selectedSession = useMemo(
    () => sessions.find(s => s.sessionId === selectedSessionId),
    [sessions, selectedSessionId]
  );

  const sessionId = selectedSessionId || initialSessionId || '';
  const host = selectedSession?.userAtIp || initialHost || 'remote-host';

  const handleTerminalClose = () => {
    // In embedded mode, just reset state
    if (isEmbedded) {
      setTerminalState('disconnected');
    } else {
      // Standalone mode: navigate back
      window.location.replace('?page=home&subpage=remote-hosts');
    }
  };

  // Session picker UI
  const renderSessionPicker = () => {
    if (sessions.length === 0) {
      return (
        <div className="px-4 py-3 bg-[#0C0C14] border-b border-[#1E1E2E] text-xs text-slate-400">
          No active sessions. Connect to a remote host first.
        </div>
      );
    }

    return (
      <div className="px-4 py-3 bg-[#0C0C14] border-b border-[#1E1E2E] flex items-center gap-3">
        <label className="text-xs font-mono uppercase tracking-wider text-slate-500">Session:</label>
        <select
          value={selectedSessionId || ''}
          onChange={(e) => handleSessionChange(e.target.value)}
          className="px-2.5 py-1.5 bg-[#13131E] border border-[#1E1E2E] rounded text-xs font-mono text-slate-300 focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all"
        >
          {sessions.map(session => (
            <option key={session.sessionId} value={session.sessionId}>
              {session.userAtIp} ({session.protocol})
            </option>
          ))}
        </select>
        {selectedSession && (
          <span className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>dns</span>
            {selectedSession.name}
          </span>
        )}
      </div>
    );
  };

  // Embedded mode: just render the terminal with session picker
  if (isEmbedded) {
    return (
      <div
        ref={containerRef}
        className="h-full flex flex-col bg-[#0F0F1A]"
      >
        {/* Terminal Container with distinct styling */}
        <div className="flex-1 flex flex-col bg-linear-to-br from-[#0F0F1A] via-[#0F0F1A] to-[#0C0C14] border border-[#1E1E2E] rounded-lg m-3 shadow-xl overflow-hidden"
          style={{ height: `${terminalHeight}px` }}
        >
          {/* Session Picker */}
          {renderSessionPicker()}

          {/* Terminal Content */}
          <div className="flex-1 overflow-hidden">
            <Terminal
              key={sessionId}
              sshSessionId={sessionId}
              host={host}
              onClose={handleTerminalClose}
              onStateChange={setTerminalState}
            />
          </div>
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={() => setIsResizing(true)}
          className="h-1 bg-linear-to-r from-[#1E1E2E] via-[#7C6DFA]/50 to-[#1E1E2E] hover:via-[#7C6DFA] cursor-ns-resize group transition-all hover:h-1.5 mx-3 rounded-full shadow-sm hover:shadow-md"
          title="Drag to resize terminal height"
        />
      </div>
    );
  }

  // Standalone mode: full-screen with header
  return (
    <div
      ref={containerRef}
      className="h-screen w-screen flex flex-col bg-linear-to-br from-[#0F0F1A] to-[#0C0C14]"
    >
      {/* Header */}
      <div className="bg-[#13131E] border-b border-[#1E1E2E] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-rounded text-[#E07B39]">terminal</span>
            <h1 className="text-xl font-bold uppercase tracking-tight text-slate-100">
              Terminal
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>→</span>
            <span>{host}</span>
            <span className="text-slate-600">({sessionId})</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* State indicator */}
          <div className="flex items-center gap-2 text-xs">
            {terminalState === 'connected' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                <span className="text-slate-300">Connected</span>
              </>
            )}
            {terminalState === 'connecting' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#7C6DFA] animate-pulse" />
                <span className="text-slate-300">Connecting...</span>
              </>
            )}
            {(terminalState === 'disconnected' || terminalState === 'error') && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#f87171]" />
                <span className="text-slate-300">
                  {terminalState === 'error' ? 'Error' : 'Disconnected'}
                </span>
              </>
            )}
            {terminalState === 'idle_timeout' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#facc15]" />
                <span className="text-slate-300">Idle Timeout</span>
              </>
            )}
            {terminalState === 'cap_exceeded' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#f87171]" />
                <span className="text-slate-300">Cap Exceeded</span>
              </>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={handleTerminalClose}
            className="p-2 hover:bg-white/5 text-slate-400 hover:text-slate-100 rounded transition-colors"
            aria-label="Close terminal"
            title="Close terminal"
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>
      </div>

      {/* Session picker */}
      {renderSessionPicker()}

      {/* Terminal Container with distinct styling */}
      <div className="flex-1 m-4 border border-[#1E1E2E] rounded-lg bg-linear-to-br from-[#0F0F1A] via-[#0F0F1A] to-[#0C0C14] shadow-xl overflow-hidden flex flex-col">
        {/* Terminal content */}
        <div className="flex-1 overflow-hidden">
          <Terminal
            key={sessionId}
            sshSessionId={sessionId}
            host={host}
            onClose={handleTerminalClose}
            onStateChange={setTerminalState}
          />
        </div>
      </div>
    </div>
  );
}
