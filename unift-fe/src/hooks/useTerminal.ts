import { useCallback, useEffect, useRef, useState } from 'react';
import { refreshAuthSession, tokenStorage } from '@/utils/apiClient';
import { API_BASE_URL } from '@/config/api.config';
import type {
  TerminalClientMessage,
  TerminalSession,
  TerminalState,
} from '@/types/terminal';
import { TERMINAL_CONFIG, TerminalCloseCode } from '@/types/terminal';

interface UseTerminalParams {
  sshSessionId: string;
  host: string;
  onOutput?: (data: string) => void;
  onStateChange?: (state: TerminalState) => void;
  onClose?: () => void;
}

function isTokenExpiredOrNearExpiry(token: string, skewSeconds = 30): boolean {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return false;
    const payload = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    if (!payload.exp) return false;
    const now = Math.floor(Date.now() / 1000);
    return payload.exp <= now + skewSeconds;
  } catch {
    return false;
  }
}

/**
 * useTerminal: Custom hook managing WebSocket connection to backend terminal.
 *
 * Responsibilities:
 * - WebSocket lifecycle (connect, disconnect, cleanup)
 * - Auto-reconnect with exponential backoff
 * - Message queuing & batching for performance
 * - Error handling & state management
 * - Ping/pong keepalive
 *
 * Design note: All values read inside async callbacks (WS event handlers) are
 * stored in refs to avoid stale closures. React state is updated for rendering
 * only — decision logic always reads refs.
 */
export function useTerminal({
  sshSessionId,
  host,
  onOutput,
  onStateChange,
  onClose,
}: UseTerminalParams) {
  // ──── Refs for managing lifecycle ───────────────────────────────────────

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const pongTimeoutRef = useRef<number | null>(null);
  const messageQueueRef = useRef<string[]>([]);
  const messageQueueFlushRef = useRef<number | null>(null);

  // Refs mirroring session state — read by callbacks to avoid stale closures
  const stateRef = useRef<TerminalState>('connecting');
  const attemptCountRef = useRef<number>(0);
  const isConnectingRef = useRef<boolean>(false); // True while WS is being set up

  // Stable ref to callbacks so WS handlers don't capture stale props
  const onOutputRef = useRef(onOutput);
  const onStateChangeRef = useRef(onStateChange);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onOutputRef.current = onOutput; }, [onOutput]);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // ──── State (for rendering only) ──────────────────────────────────────

  const [session, setSession] = useState<TerminalSession>({
    state: 'connecting',
    wsSessionId: null,
    error: null,
    sshSessionId,
    host,
    isReconnecting: false,
    attemptCount: 0,
  });

  // ── Sync helper: update both ref and React state ─────────────────────
  const updateState = useCallback((newState: TerminalState, error: string | null = null) => {
    stateRef.current = newState;
    setSession((prev) => ({ ...prev, state: newState, error }));
    onStateChangeRef.current?.(newState);
  }, []);

  // ──── Message queue helpers ────────────────────────────────────────────

  const flushMessageQueue = useCallback(() => {
    if (messageQueueRef.current.length === 0) return;
    const batched = messageQueueRef.current.join('');
    messageQueueRef.current = [];
    if (messageQueueFlushRef.current) {
      clearTimeout(messageQueueFlushRef.current);
      messageQueueFlushRef.current = null;
    }
    onOutputRef.current?.(batched);
  }, []);

  const scheduleMessageFlush = useCallback(() => {
    if (messageQueueFlushRef.current) clearTimeout(messageQueueFlushRef.current);
    messageQueueFlushRef.current = window.setTimeout(
      flushMessageQueue,
      TERMINAL_CONFIG.messageQueueFlushMs,
    );
  }, [flushMessageQueue]);

  // ──── Connection management ────────────────────────────────────────────

  /**
   * Close any existing WS and clean up all timers.
   * This is safe to call at any time — all operations are idempotent.
   */
  const closeExistingConnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }
    if (messageQueueFlushRef.current) {
      clearTimeout(messageQueueFlushRef.current);
      messageQueueFlushRef.current = null;
    }
    const existing = wsRef.current;
    if (existing) {
      // Remove handlers first so the close event doesn't trigger auto-reconnect
      existing.onopen = null;
      existing.onmessage = null;
      existing.onclose = null;
      existing.onerror = null;

      if (existing.readyState === WebSocket.OPEN) {
        existing.close(1000, 'user-switch');
      } else if (existing.readyState === WebSocket.CONNECTING) {
        // Avoid browser warning: "WebSocket is closed before the connection is established".
        // Defer close until handshake completes.
        existing.addEventListener(
          'open',
          () => {
            try {
              existing.close(1000, 'user-switch');
            } catch {
              // Ignore close errors for torn-down sockets.
            }
          },
          { once: true },
        );
      }

      wsRef.current = null;
    }
    isConnectingRef.current = false;
    messageQueueRef.current = [];
  }, []);

  /**
   * Open a new WebSocket connection to the backend terminal.
   * Reads sshSessionId from a ref so it is always current.
   */
  const sshSessionIdRef = useRef(sshSessionId);
  sshSessionIdRef.current = sshSessionId;

  const connect = useCallback(async () => {
    // Guard: don't double-connect  
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      console.debug('[Terminal] connect() skipped — already connecting or connected');
      return;
    }

    // Don't retry on permanent errors
    const currentState = stateRef.current;
    if (currentState === 'cap_exceeded') return;

    let accessToken = tokenStorage.getAccess();
    if (!accessToken || isTokenExpiredOrNearExpiry(accessToken)) {
      const refreshed = await refreshAuthSession();
      if (refreshed) {
        accessToken = tokenStorage.getAccess();
      }
    }
    if (!accessToken) {
      updateState('error', 'Authentication token not found. Please log in again.');
      return;
    }

    let wsHost: string;
    try {
      const apiUrl = new URL(API_BASE_URL);
      wsHost = apiUrl.host;
    } catch {
      wsHost = window.location.host;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const currentSessionId = sshSessionIdRef.current;
    // Browser WebSocket clients cannot set custom headers (e.g. Authorization) during
    // the HTTP upgrade handshake. We use the Sec-WebSocket-Protocol subprotocol trick:
    // transmit the JWT as "Bearer.<token>" so it arrives as a proper header on the server.
    const wsUrl = `${wsProtocol}//${wsHost}/api/ws/terminal/${currentSessionId}`;
    const wsProtocols = [`Bearer.${accessToken}`];

    console.log('[Terminal] Connecting to WebSocket:', {
      url: wsUrl,
      sessionId: currentSessionId,
    });

    isConnectingRef.current = true;
    attemptCountRef.current += 1;
    setSession((prev) => ({
      ...prev,
      state: 'connecting',
      error: null,
      isReconnecting: attemptCountRef.current > 1,
      attemptCount: attemptCountRef.current,
    }));
    stateRef.current = 'connecting';

    try {
      const ws = new WebSocket(wsUrl, wsProtocols);

      ws.onopen = () => {
        isConnectingRef.current = false;
        attemptCountRef.current = 0;
        setSession((prev) => ({
          ...prev,
          state: 'connected',
          error: null,
          isReconnecting: false,
          attemptCount: 0,
        }));
        stateRef.current = 'connected';
        onStateChangeRef.current?.('connected');

        // Start ping interval
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = window.setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ping' }));

            if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
            pongTimeoutRef.current = window.setTimeout(() => {
              console.warn('[Terminal] Pong timeout — terminating connection');
              wsRef.current?.close(1000, 'pong-timeout');
            }, TERMINAL_CONFIG.pongTimeoutMs);
          }
        }, TERMINAL_CONFIG.pingIntervalMs);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          // Attempt JSON parse for control messages
          try {
            const msg = JSON.parse(event.data as string);
            if (msg.type === 'pong') {
              if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
              return;
            }
          } catch {
            // Not JSON — raw terminal output, fall through
          }
          messageQueueRef.current.push(event.data as string);
          scheduleMessageFlush();
        } catch (err) {
          console.error('[Terminal] Message handler error:', err);
        }
      };

      ws.onclose = (event: CloseEvent) => {
        isConnectingRef.current = false;
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);

        // If we nulled out wsRef ourselves (user-switch), ignore
        if (wsRef.current !== ws) return;
        wsRef.current = null;

        let newState: TerminalState = 'disconnected';
        let errorMsg: string | null = event.reason || 'Connection closed';
        // When false, skip auto-reconnect (intentional close or permanent error)
        let shouldReconnect = false;

        switch (event.code) {
          case TerminalCloseCode.SessionNotFound:
            newState = 'disconnected';
            errorMsg = 'SSH session not found or expired.';
            break;
          case TerminalCloseCode.AccessDenied:
            newState = 'error';
            errorMsg = 'Access denied — you do not own this session.';
            break;
          case TerminalCloseCode.NoTerminalSupport:
            newState = 'error';
            errorMsg = 'This remote does not support terminal access.';
            break;
          case TerminalCloseCode.IdleTimeout:
            newState = 'idle_timeout';
            errorMsg = 'Terminal session timed out due to inactivity.';
            break;
          case TerminalCloseCode.CapExceeded:
            newState = 'cap_exceeded';
            errorMsg = 'You have reached the maximum number of open terminals.';
            break;
          case 1000:
            // Normal close (e.g. user typed "exit") — close the terminal, do not reconnect
            newState = 'disconnected';
            errorMsg = null;
            break;
          case 1006:
            // Abnormal closure — schedule reconnect if under limit
            if (attemptCountRef.current < TERMINAL_CONFIG.maxReconnectAttempts) {
              newState = 'connecting';
              errorMsg = null;
              shouldReconnect = true;
            } else {
              newState = 'error';
              errorMsg = 'Connection lost. Max reconnection attempts exceeded.';
            }
            break;
          default:
            // Unknown close code — attempt reconnect if under limit
            if (attemptCountRef.current < TERMINAL_CONFIG.maxReconnectAttempts) {
              newState = 'connecting';
              errorMsg = null;
              shouldReconnect = true;
            } else {
              newState = 'disconnected';
              errorMsg = null;
            }
        }

        stateRef.current = newState;
        setSession((prev) => ({
          ...prev,
          state: newState,
          error: errorMsg,
          wsSessionId:
            newState === 'error' || newState === 'idle_timeout' || newState === 'cap_exceeded'
              ? null
              : prev.wsSessionId,
        }));
        onStateChangeRef.current?.(newState);

        // Do not auto-close the panel on disconnect/error/timeout — the status bar
        // will render and let the user decide to reconnect or explicitly close.
        // onClose is only called by user-initiated actions (status bar "Close" button
        // or the panel header × button), preventing rare self-closing on network blips.
        if (newState === 'error' || newState === 'idle_timeout' || newState === 'cap_exceeded') {
          return;
        }

        // For code 1000 (normal close, e.g. user typed "exit"), show the disconnected
        // status bar rather than silently dismissing the panel.
        if (event.code === 1000) {
          return;
        }

        // Schedule reconnect only for abnormal closures
        if (shouldReconnect) {
          const delay = Math.min(
            TERMINAL_CONFIG.initialReconnectDelayMs *
              Math.pow(TERMINAL_CONFIG.reconnectBackoffMultiplier, attemptCountRef.current - 1),
            TERMINAL_CONFIG.maxReconnectDelayMs,
          );
          reconnectTimeoutRef.current = window.setTimeout(connect, delay);
        }
      };

      ws.onerror = (event: Event) => {
        console.error('[Terminal] WebSocket error:', event);
        // onclose will fire after onerror, handling state there
      };

      wsRef.current = ws;
    } catch (err) {
      isConnectingRef.current = false;
      console.error('[Terminal] WebSocket creation error:', err);
      updateState('error', 'Failed to create WebSocket connection.');
    }
  }, [updateState, scheduleMessageFlush]);

  // ──── Public API ───────────────────────────────────────────────────────

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: TerminalClientMessage = { type: 'input', data };
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('[Terminal] WebSocket not OPEN, input dropped', {
        readyState: wsRef.current?.readyState,
      });
    }
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: TerminalClientMessage = {
        type: 'resize',
        cols: Math.max(10, Math.min(500, cols)),
        rows: Math.max(5, Math.min(200, rows)),
      };
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const disconnect = useCallback(() => {
    flushMessageQueue();
    closeExistingConnection();
  }, [flushMessageQueue, closeExistingConnection]);

  const tryReconnect = useCallback(() => {
    attemptCountRef.current = 0;
    stateRef.current = 'disconnected';
    closeExistingConnection();
    connect();
  }, [connect, closeExistingConnection]);

  // ──── Lifecycle ────────────────────────────────────────────────────────

  // Connect on mount / when sshSessionId changes
  useEffect(() => {
    // Reset attempt count for fresh session
    attemptCountRef.current = 0;
    stateRef.current = 'connecting';
    isConnectingRef.current = false;

    // Close any existing connection before opening a new one
    closeExistingConnection();
    connect();

    return () => {
      closeExistingConnection();
    };
    // Re-run only when the session ID changes (new connection needed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sshSessionId]);

  return {
    session,
    sendInput,
    sendResize,
    disconnect,
    tryReconnect,
  };
}
