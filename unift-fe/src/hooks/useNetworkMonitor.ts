// ─── useNetworkMonitor ─────────────────────────────────────────────────────
// Opens a hidden raw WebSocket terminal connection to the SSH session and runs
// an infinite monitoring loop that emits live network I/O stats every second.
// The hook returns the latest rx/tx readings plus a rolling history array.
// Cleanup sends SIGINT (Ctrl+C) and closes the WS on unmount.
import { useCallback, useEffect, useRef, useState } from 'react';
import { tokenStorage } from '@/utils/apiClient';
import { API_BASE_URL } from '@/config/api.config';

export interface NetSample {
  rxKbps: number;
  txKbps: number;
  /** Epoch ms when this sample was captured on the client side. */
  capturedAt: number;
}

export interface NetworkMonitorState {
  latest: NetSample | null;
  history: NetSample[];
  /** Whether the WS connection is alive (not necessarily receiving data yet). */
  connected: boolean;
  error: string | null;
}

const HISTORY_LIMIT = 30;

// The marker prefix used to identify net-stats lines in terminal output.
// A unique string unlikely to clash with normal shell output.
const NET_MARKER = '__UNIFT_NET__';

// ANSI escape code regex — needed to strip terminal decoration bytes from raw output.
// eslint-disable-next-line no-control-regex
const ANSI_STRIP = /\u001b\[[0-9;]*[a-zA-Z]|\r|\u001b\].*?\u0007|\u001b[\[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;

// Bash one-liner that runs on the remote host.
// - Detects the default network interface via `ip route` (linux) or falls back to
//   the first non-loopback entry in /proc/net/dev.
// - Reads /proc/net/dev byte-counters twice with a 1-second gap.
// - Emits a uniquely-prefixed line so the client can parse it reliably.
const NET_MONITOR_SCRIPT =
  `while true; do ` +
    `IF=$(ip route 2>/dev/null | awk '/default/{print $5; exit}'); ` +
    `[ -z "$IF" ] && IF=$(awk 'NR>2{gsub(/:$/,"",$1);if($1!="lo"){print $1;exit}}' /proc/net/dev 2>/dev/null); ` +
    `R1=$(awk -v i="${'$'}IF:" 'NF>1&&$1==i{print $2}' /proc/net/dev 2>/dev/null); ` +
    `T1=$(awk -v i="${'$'}IF:" 'NF>1&&$1==i{print $10}' /proc/net/dev 2>/dev/null); ` +
    `sleep 1; ` +
    `R2=$(awk -v i="${'$'}IF:" 'NF>1&&$1==i{print $2}' /proc/net/dev 2>/dev/null); ` +
    `T2=$(awk -v i="${'$'}IF:" 'NF>1&&$1==i{print $10}' /proc/net/dev 2>/dev/null); ` +
    `[ -n "$R1" ] && [ -n "$R2" ] && awk "BEGIN{printf \\"${NET_MARKER} %.2f %.2f\\n\\",($R2-$R1)/1024,($T2-$T1)/1024}"; ` +
  `done\n`;

// The same but avoids nested variable expansion issues by building the script
// without template literal quirks. The $IF references are literal bash variables
// inside the single-quoted awk args.
function buildScript(): string {
  return (
    'while true; do ' +
    'IF=$(ip route 2>/dev/null | awk \'/default/{print $5; exit}\'); ' +
    '[ -z "$IF" ] && IF=$(awk \'NR>2{gsub(/:$/,"",$1);if($1!="lo"){print $1;exit}}\' /proc/net/dev 2>/dev/null); ' +
    'R1=$(awk -v i="$IF:" \'NF>1&&$1==i{print $2}\' /proc/net/dev 2>/dev/null); ' +
    'T1=$(awk -v i="$IF:" \'NF>1&&$1==i{print $10}\' /proc/net/dev 2>/dev/null); ' +
    'sleep 1; ' +
    'R2=$(awk -v i="$IF:" \'NF>1&&$1==i{print $2}\' /proc/net/dev 2>/dev/null); ' +
    'T2=$(awk -v i="$IF:" \'NF>1&&$1==i{print $10}\' /proc/net/dev 2>/dev/null); ' +
    '[ -n "$R1" ] && [ -n "$R2" ] && awk "BEGIN{printf \\"' + NET_MARKER + ' %.2f %.2f\\\\n\\",' +
    '($R2-$R1)/1024,($T2-$T1)/1024}"; ' +
    'done\n'
  );
}

export function useNetworkMonitor(sessionId: string | null): NetworkMonitorState {
  const [state, setState] = useState<NetworkMonitorState>({
    latest: null,
    history: [],
    connected: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  // Accumulate partial output lines across WS message boundaries
  const bufferRef = useRef('');

  const handleMessage = useCallback((data: string) => {
    // Strip ANSI codes and carriage returns
    const clean = data.replace(ANSI_STRIP, '');
    bufferRef.current += clean;

    const lines = bufferRef.current.split('\n');
    // The last element may be an incomplete line — keep it in the buffer
    bufferRef.current = lines.pop() ?? '';

    for (const line of lines) {
      const idx = line.indexOf(NET_MARKER);
      if (idx === -1) continue;
      const rest = line.slice(idx + NET_MARKER.length).trim();
      const parts = rest.split(/\s+/);
      if (parts.length < 2) continue;
      const rx = parseFloat(parts[0]);
      const tx = parseFloat(parts[1]);
      if (isNaN(rx) || isNaN(tx)) continue;
      const sample: NetSample = { rxKbps: rx, txKbps: tx, capturedAt: Date.now() };
      setState(prev => ({
        ...prev,
        latest: sample,
        history: [...prev.history.slice(-(HISTORY_LIMIT - 1)), sample],
      }));
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const token = tokenStorage.getAccess();
    if (!token) {
      setState(prev => ({ ...prev, error: 'Not authenticated' }));
      return;
    }

    let wsHost: string;
    try {
      wsHost = new URL(API_BASE_URL).host;
    } catch {
      wsHost = window.location.host;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsProtocol}//${wsHost}/api/ws/terminal/${sessionId}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url, [`Bearer.${token}`]);
    } catch (err) {
      setState(prev => ({ ...prev, error: String(err) }));
      return;
    }

    wsRef.current = ws;
    bufferRef.current = '';

    ws.onopen = () => {
      setState(prev => ({ ...prev, connected: true, error: null }));
      // Send a resize message so the shell initialises cleanly (cols=200 avoids word-wrap noise)
      ws.send(JSON.stringify({ type: 'resize', cols: 200, rows: 24 }));
      // Give the shell a moment to initialise before sending the script
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data: buildScript() }));
        }
      }, 600);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        handleMessage(event.data);
      }
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, connected: false }));
    };

    ws.onerror = () => {
      setState(prev => ({ ...prev, connected: false, error: 'Monitor connection failed' }));
    };

    return () => {
      // Send Ctrl+C to kill the loop before closing
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: '\x03' }));
        setTimeout(() => ws.close(1000, 'unmount'), 100);
      } else {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [sessionId, handleMessage]);

  return state;
}

// ─── useDockerDetect ────────────────────────────────────────────────────────
// One-shot WS terminal connection: runs `command -v docker` and returns whether
// Docker is present on the remote host. Closes the WS after receiving the result.

export type DockerDetectState = 'checking' | 'present' | 'absent' | 'error';

const DOCKER_YES = '__UNIFT_DOCK_YES__';
const DOCKER_NO  = '__UNIFT_DOCK_NO__';

export function useDockerDetect(sessionId: string | null): DockerDetectState {
  const [phase, setPhase] = useState<DockerDetectState>('checking');
  const doneRef = useRef(false);
  const bufferRef = useRef('');

  useEffect(() => {
    if (!sessionId || doneRef.current) return;

    const token = tokenStorage.getAccess();
    if (!token) { setPhase('error'); return; }

    let wsHost: string;
    try {
      wsHost = new URL(API_BASE_URL).host;
    } catch {
      wsHost = window.location.host;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsProtocol}//${wsHost}/api/ws/terminal/${sessionId}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url, [`Bearer.${token}`]);
    } catch {
      setPhase('error');
      return;
    }

    const timeout = window.setTimeout(() => {
      // If we haven't got a result in 8 s, treat as absent (server might not have /proc)
      if (!doneRef.current) {
        doneRef.current = true;
        setPhase('absent');
        ws.close();
      }
    }, 8000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'resize', cols: 200, rows: 24 }));
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const cmd =
            `command -v docker >/dev/null 2>&1 && echo '${DOCKER_YES}' || echo '${DOCKER_NO}'\n`;
          ws.send(JSON.stringify({ type: 'input', data: cmd }));
        }
      }, 600);
    };

    ws.onmessage = (event) => {
      if (doneRef.current || typeof event.data !== 'string') return;
      const clean = event.data.replace(ANSI_STRIP, '');
      bufferRef.current += clean;
      if (bufferRef.current.includes(DOCKER_YES)) {
        doneRef.current = true;
        clearTimeout(timeout);
        setPhase('present');
        ws.send(JSON.stringify({ type: 'input', data: '\x03' }));
        ws.close();
      } else if (bufferRef.current.includes(DOCKER_NO)) {
        doneRef.current = true;
        clearTimeout(timeout);
        setPhase('absent');
        ws.send(JSON.stringify({ type: 'input', data: '\x03' }));
        ws.close();
      }
    };

    ws.onerror = () => {
      if (!doneRef.current) {
        clearTimeout(timeout);
        doneRef.current = true;
        setPhase('error');
      }
    };

    return () => {
      clearTimeout(timeout);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return phase;
}

// Unused export to avoid the junk TS error on the template-literal workaround
void NET_MONITOR_SCRIPT;
