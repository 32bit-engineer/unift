import { useEffect, useRef } from 'react';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from '@/hooks/useTerminal';
import type { TerminalProps } from '@/types/terminal';

/**
 * Terminal: Production-grade terminal UI component.
 *
 * Renders xterm.js terminal with:
 * - WebSocket backend integration
 * - Auto-fit to container size
 * - Web links addon
 * - Error states with user feedback
 * - Keyboard shortcuts
 */
export function Terminal({
  sshSessionId,
  host,
  onClose,
  onStateChange,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Setup WebSocket connection
  const { session, sendInput, sendResize, tryReconnect } = useTerminal({
    sshSessionId,
    host,
    onOutput: (data) => {
      terminalRef.current?.write(data);
    },
    onStateChange,
    onClose,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal instance
    const terminal = new XTermTerminal({
      rows: 24,
      cols: 80,
      fontSize: 12,
      fontFamily: 'IBM Plex Mono, monospace',
      theme: {
        background: '#11141C',
        foreground: '#E2E8F0',
        cursor: '#4F8EF7',
      },
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 1000,
      disableStdin: false,
      screenReaderMode: true,
    });
    terminalRef.current = terminal;

    // Load addons
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon();
    terminal.loadAddon(webLinksAddon);

    // Render to container
    terminal.open(containerRef.current);

    // Auto-focus terminal so user can type immediately
    terminal.focus();

    // Fit to initial size and send to server
    fitAddon.fit();
    if (session.state === 'connected') {
      sendResize(terminal.cols, terminal.rows);
    }

    terminal.onData((data: string) => {
      sendInput(data);
    });


    terminal.onKey(({ domEvent }: { key: string; domEvent: KeyboardEvent }) => {
      // Ctrl+Shift+C = Copy (handled by xterm default)
      // Ctrl+Shift+V = Paste (handled by xterm default)

      // Ctrl+Shift+R = Reconnect (if disconnected)
      if (
        domEvent.ctrlKey &&
        domEvent.shiftKey &&
        (domEvent.key === 'r' || domEvent.key === 'R')
      ) {
        domEvent.preventDefault();
        if (session.state === 'error' || session.state === 'disconnected') {
          tryReconnect();
        }
      }
    });

    resizeObserverRef.current = new ResizeObserver(() => {
      if (fitAddon && containerRef.current) {
        try {
          fitAddon.fit();
          sendResize(terminal.cols, terminal.rows);
        } catch (err) {
          console.error('Terminal fit/resize error:', err);
        }
      }
    });
    resizeObserverRef.current.observe(containerRef.current);

    return () => {
      resizeObserverRef.current?.disconnect();
      terminal.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendInput, sendResize]);


  useEffect(() => {
    if (session.state === 'connected' && terminalRef.current) {
      // Clear any previous messages and enable input
      terminalRef.current.focus();
    }
  }, [session.state]);


  const renderStatusBar = () => {
    if (session.state === 'connected') {
      return null; // No status bar when running
    }

    return (
      <div className="bg-[#1E2130] border-t border-[#2E3348] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {session.state === 'connecting' && (
            <>
              <span className="w-2 h-2 rounded-full bg-[#4F8EF7] animate-pulse" />
              <span className="text-xs text-slate-300">
                Connecting to <span className="font-mono">{host}</span>
                {session.isReconnecting && ` (attempt ${session.attemptCount})`}
              </span>
            </>
          )}

          {session.state === 'disconnected' && (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-600" />
              <span className="text-xs text-slate-400">
                Disconnected. Press <span className="font-mono font-bold">Ctrl+Shift+R</span> to
                reconnect
              </span>
            </>
          )}

          {session.state === 'idle_timeout' && (
            <>
              <span className="w-2 h-2 rounded-full bg-[#facc15]" />
              <span className="text-xs text-slate-300">{session.error}</span>
            </>
          )}

          {session.state === 'cap_exceeded' && (
            <>
              <span className="w-2 h-2 rounded-full bg-[#f87171]" />
              <span className="text-xs text-slate-300">{session.error}</span>
            </>
          )}

          {session.state === 'error' && (
            <>
              <span className="w-2 h-2 rounded-full bg-[#f87171]" />
              <span className="text-xs text-slate-300">{session.error}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {(session.state === 'error' ||
            session.state === 'disconnected' ||
            session.state === 'idle_timeout') && (
            <button
              onClick={() => tryReconnect()}
              className="px-3 py-1.5 bg-[#4F8EF7] hover:brightness-110 text-[10px] font-mono
                font-bold uppercase tracking-widest text-white rounded transition-all"
              aria-label="Reconnect to terminal"
            >
              Reconnect
            </button>
          )}

          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-[#2E3348] hover:bg-white/5 text-[10px] font-mono
              font-bold uppercase tracking-widest text-slate-300 rounded transition-all"
            aria-label="Close terminal"
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#161923]">
      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-text"
        style={{
          // Apply xterm CSS customizations
          '--xterm-font-family': 'IBM Plex Mono, monospace',
          '--xterm-font-size': '12px',
        } as React.CSSProperties}
        onClick={() => terminalRef.current?.focus()}
      />

      {/* Status bar */}
      {renderStatusBar()}
    </div>
  );
}
