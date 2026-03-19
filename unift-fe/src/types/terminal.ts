// Terminal WebSocket types and constants

// Wire protocol - Client → Server

export interface TerminalInputMessage {
  type: 'input';
  data: string; // Raw terminal input
}

export interface TerminalResizeMessage {
  type: 'resize';
  cols: number; // 10-500
  rows: number; // 5-200
}

export type TerminalClientMessage = TerminalInputMessage | TerminalResizeMessage;

// WebSocket close codes

export const TerminalCloseCode = {
  SessionNotFound: 4000,     // SSH session expired or doesn't exist
  AccessDenied: 4001,        // User doesn't own this session
  NoTerminalSupport: 4003,   // Remote doesn't support terminal access
  IdleTimeout: 4008,         // Shell idle > timeout threshold
  CapExceeded: 4029,         // Per-user or global terminal cap exceeded
} as const;

export type TerminalCloseCodeValue = typeof TerminalCloseCode[keyof typeof TerminalCloseCode];

export interface TerminalCloseReason {
  code: number;
  reason: string;
}

// Terminal session state 

export type TerminalState =
  | 'connecting'    // WebSocket connecting
  | 'connected'     // WebSocket open, shell ready
  | 'disconnected'  // WebSocket closed (terminal exited)
  | 'error'         // Error state (show to user)
  | 'idle_timeout'  // Server closed due to inactivity
  | 'cap_exceeded'; // Per-user cap hit

export interface TerminalSession {
  state: TerminalState;
  wsSessionId: string | null; // Assigned by server after connection
  error: string | null;       // Human-readable error
  sshSessionId: string;       // From props
  host: string;               // From props
  isReconnecting: boolean;
  attemptCount: number;
}

//  Props for Terminal component

export interface TerminalProps {
  sshSessionId: string;    // Which remote session to connect to
  host: string;            // For display/logging
  onClose?: () => void;    // Callback when user closes or error occurs
  onStateChange?: (state: TerminalState) => void;
}

//  xterm.js options (customized for UniFT design)

export const XTERM_OPTIONS = {
  rows: 24,
  cols: 80,
  fontSize: 12,
  fontFamily: 'IBM Plex Mono, monospace',
  theme: {
    background: '#11141C', // recessed
    foreground: '#E2E8F0', // text-warm
    cursor: '#4F8EF7',     // primary
    selection: 'rgba(79, 142, 247, 0.3)', // primary with alpha
    black: '#0a0e14',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#facc15',
    blue: '#4F8EF7',
    magenta: '#d946ef',
    cyan: '#06b6d4',
    white: '#e2e8f0',
    brightBlack: '#606b83',
    brightRed: '#fb7185',
    brightGreen: '#86efac',
    brightYellow: '#fde047',
    brightBlue: '#60a5fa',
    brightMagenta: '#f0abfc',
    brightCyan: '#22d3ee',
    brightWhite: '#f1f5f9',
  },
  cursorBlink: true,
  cursorStyle: 'block' as const,
  scrollback: 1000,
  disableStdin: false,
  screenReaderMode: true,
  convertEol: true,
};

//  Connection retry config

export const TERMINAL_CONFIG = {
  maxReconnectAttempts: 5,
  initialReconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  reconnectBackoffMultiplier: 2,
  pingIntervalMs: 30000, // Send ping every 30s to keep connection alive
  pongTimeoutMs: 10000,  // Wait 10s for pong response
  messageQueueFlushMs: 50, // Batch output updates
} as const;
