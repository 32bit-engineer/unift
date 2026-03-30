import { create } from 'zustand';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type {
  SessionState,
  SavedHostResponse,
  ConnectRequest,
  SessionAnalyticsResponse,
  WorkspaceType,
} from '@/utils/remoteConnectionAPI';

/**
 * Capabilities detected for a session.
 * Drives dynamic sidebar rendering in workspace views.
 */
export interface SessionCapabilities {
  terminal: boolean;
  files: boolean;
  docker: boolean;
  kubernetes: boolean;
}

/**
 * Enriched session representation used across the entire UI.
 * Maps from the raw SessionState API response.
 */
export interface UISession {
  sessionId: string;
  name: string;
  host: string;
  port: number;
  username: string;
  protocol: string;
  status: 'online' | 'offline';
  createdAt: string;
  expiresAt: string;
  homeDirectory?: string;
  remoteOs?: string;
  capabilities: SessionCapabilities;
  analytics?: SessionAnalyticsResponse;
  /** The active workspace type for this session (ssh, docker, kubernetes). */
  workspaceType: WorkspaceType;
  /** The saved host ID that spawned this session, if any. Used for preference persistence. */
  savedHostId?: string;
  /** Whether capability detection has run for this session. */
  capabilitiesDetected: boolean;
}

interface ConnectionState {
  sessions: UISession[];
  savedHosts: SavedHostResponse[];
  activeWorkspaceSessionId: string | null;
  isLoadingSessions: boolean;
  isLoadingSavedHosts: boolean;
  connectingHostId: string | null;
  deletingHostId: string | null;
  error: string | null;

  // Session actions
  fetchSessions: () => Promise<void>;
  openSession: (request: ConnectRequest) => Promise<UISession>;
  closeSession: (sessionId: string) => Promise<void>;
  connectSavedHost: (hostId: string) => Promise<UISession>;
  setActiveWorkspace: (sessionId: string | null) => void;
  updateSessionCapabilities: (sessionId: string, capabilities: Partial<SessionCapabilities>) => void;
  updateSessionAnalytics: (sessionId: string, analytics: SessionAnalyticsResponse) => void;
  setWorkspaceType: (sessionId: string, workspaceType: WorkspaceType) => void;
  markCapabilitiesDetected: (sessionId: string) => void;

  // Saved host actions
  fetchSavedHosts: () => Promise<void>;
  deleteSavedHost: (hostId: string) => Promise<void>;

  // Helpers
  getSession: (sessionId: string) => UISession | undefined;
  getActiveWorkspaceSession: () => UISession | undefined;
  clearError: () => void;
}

function mapToUISession(raw: SessionState): UISession {
  return {
    sessionId: raw.sessionId,
    name: raw.label ?? `${raw.host}:${raw.port}`,
    host: raw.host,
    port: raw.port,
    username: raw.username,
    protocol: raw.protocol,
    status: raw.state === 'ACTIVE' ? 'online' : 'offline',
    createdAt: raw.createdAt,
    expiresAt: raw.expiresAt,
    homeDirectory: raw.homeDirectory,
    remoteOs: raw.remoteOs,
    capabilities: {
      terminal: true,
      files: true,
      docker: false,
      kubernetes: false,
    },
    workspaceType: 'ssh',
    capabilitiesDetected: false,
  };
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  sessions: [],
  savedHosts: [],
  activeWorkspaceSessionId: null,
  isLoadingSessions: false,
  isLoadingSavedHosts: false,
  connectingHostId: null,
  deletingHostId: null,
  error: null,

  fetchSessions: async () => {
    set({ isLoadingSessions: true, error: null });
    try {
      const raw = await remoteConnectionAPI.listSessions();
      set({ sessions: raw.map(mapToUISession), isLoadingSessions: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sessions';
      set({ isLoadingSessions: false, error: message });
    }
  },

  openSession: async (request) => {
    set({ error: null });
    try {
      const raw = await remoteConnectionAPI.connect(request);
      const session = mapToUISession(raw);
      set(state => ({ sessions: [...state.sessions, session] }));
      return session;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open session';
      set({ error: message });
      throw err;
    }
  },

  closeSession: async (sessionId) => {
    try {
      await remoteConnectionAPI.closeSession(sessionId);
      set(state => ({
        sessions: state.sessions.filter(s => s.sessionId !== sessionId),
        activeWorkspaceSessionId:
          state.activeWorkspaceSessionId === sessionId ? null : state.activeWorkspaceSessionId,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to close session';
      set({ error: message });
    }
  },

  connectSavedHost: async (hostId) => {
    set({ connectingHostId: hostId, error: null });
    try {
      const raw = await remoteConnectionAPI.connectSavedHost(hostId);
      const session = mapToUISession(raw);
      set(state => ({
        sessions: [...state.sessions, session],
        connectingHostId: null,
      }));
      // Refresh saved hosts to update lastUsed timestamp
      get().fetchSavedHosts();
      return session;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      set({ connectingHostId: null, error: message });
      throw err;
    }
  },

  setActiveWorkspace: (sessionId) => {
    set({ activeWorkspaceSessionId: sessionId });
  },

  updateSessionCapabilities: (sessionId, capabilities) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.sessionId === sessionId
          ? { ...s, capabilities: { ...s.capabilities, ...capabilities } }
          : s,
      ),
    }));
  },

  updateSessionAnalytics: (sessionId, analytics) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.sessionId === sessionId ? { ...s, analytics } : s,
      ),
    }));
  },

  setWorkspaceType: (sessionId, workspaceType) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.sessionId === sessionId ? { ...s, workspaceType } : s,
      ),
    }));
  },

  markCapabilitiesDetected: (sessionId) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.sessionId === sessionId ? { ...s, capabilitiesDetected: true } : s,
      ),
    }));
  },

  fetchSavedHosts: async () => {
    set({ isLoadingSavedHosts: true });
    try {
      const hosts = await remoteConnectionAPI.listSavedHosts();
      set({ savedHosts: hosts, isLoadingSavedHosts: false });
    } catch {
      set({ isLoadingSavedHosts: false });
    }
  },

  deleteSavedHost: async (hostId) => {
    set({ deletingHostId: hostId });
    try {
      await remoteConnectionAPI.deleteSavedHost(hostId);
      set(state => ({
        savedHosts: state.savedHosts.filter(h => h.id !== hostId),
        deletingHostId: null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete host';
      set({ deletingHostId: null, error: message });
    }
  },

  getSession: (sessionId) => get().sessions.find(s => s.sessionId === sessionId),

  getActiveWorkspaceSession: () => {
    const { sessions, activeWorkspaceSessionId } = get();
    if (!activeWorkspaceSessionId) return undefined;
    return sessions.find(s => s.sessionId === activeWorkspaceSessionId);
  },

  clearError: () => set({ error: null }),
}));
