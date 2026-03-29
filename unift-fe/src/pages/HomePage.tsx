import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Sidebar } from '@/components/layout';
import type { SavedHost } from '@/components/layout';
import { RemoteHostsManagerPage } from './RemoteHostsManagerPage';
import { DashboardPage } from './DashboardPage';
import { SavedHostsPage } from './SavedHostsPage';
import { TransferHistoryPage } from './TransferHistoryPage';
import { TransferLogPage } from './TransferLogPage';
import { UploadSessionsPage } from './UploadSessionsPage';
import { TransferProgressPopup } from '@/components/ui';
import { remoteConnectionAPI, type SessionState, type SavedHostResponse } from '@/utils/remoteConnectionAPI';
import { getErrorMessage } from '@/utils/apiClient';
import type { UIHost } from './RemoteHostsManagerPage';

// ─── Valid subpage ids ─────────────────────────────────────────────────────
type SubPage =
  | 'my-files'
  | 'remote-hosts'
  | 'streaming'
  | 'recent'
  | 'starred'
  | 'shared'
  | 'trash'
  | 'saved-hosts'
  | 'transfer-history'
  | 'transfer-log'
  | 'upload-sessions';

const VALID_SUBPAGES: SubPage[] = [
  'my-files', 'remote-hosts', 'streaming', 'recent', 'starred', 'shared', 'trash', 'saved-hosts', 'transfer-history', 'transfer-log', 'upload-sessions',
];

function getSubPage(): SubPage {
  const raw = new URLSearchParams(window.location.search).get('subpage');
  if (raw && (VALID_SUBPAGES as string[]).includes(raw)) return raw as SubPage;
  return 'remote-hosts';
}

function setSubPageUrl(subpage: SubPage) {
  const url = new URL(window.location.href);
  url.searchParams.set('page', 'home');
  url.searchParams.set('subpage', subpage);
  window.history.pushState(null, '', url.toString());
}

// ─── Breadcrumb segments per active nav item ───────────────────────────────
const BREADCRUMBS: Record<SubPage, { parts: string[]; title: string; subtitle: string }> = {
  'my-files':          { parts: ['Home', 'Dashboard'],                  title: 'Dashboard',         subtitle: 'Cluster overview and live session metrics.' },
  'remote-hosts':      { parts: ['Home', 'Remote Host', 'Connections'], title: 'Remote Hosts',      subtitle: 'Manage SFTP, FTP, and SMB connections to remote servers.' },
  'streaming':         { parts: ['Home', 'Streaming'],                  title: 'Streaming',         subtitle: 'Stream media from remote sources.' },
  'recent':            { parts: ['Home', 'Recent'],                     title: 'Recent',            subtitle: 'Recently accessed files.' },
  'starred':           { parts: ['Home', 'Starred'],                    title: 'Starred',           subtitle: 'Your starred items.' },
  'shared':            { parts: ['Home', 'Shared'],                     title: 'Shared',            subtitle: 'Files shared with you.' },
  'trash':             { parts: ['Home', 'Trash'],                      title: 'Trash',             subtitle: 'Deleted files.' },
  'saved-hosts':       { parts: ['Home', 'Saved Hosts'],                title: 'Saved Hosts',       subtitle: 'All your bookmarked host configurations.' },
  'transfer-history':  { parts: ['Home', 'My Files', 'Transfers'],      title: 'Transfer History',  subtitle: 'All uploads and downloads across active sessions.' },
  'transfer-log':      { parts: ['Home', 'Transfers', 'Log'],           title: 'Transfer Log',      subtitle: 'Persistent audit trail of completed, failed, and cancelled transfers.' },
  'upload-sessions':   { parts: ['Home', 'Transfers', 'Uploads'],       title: 'Upload Sessions',   subtitle: 'Resumable chunked upload sessions and their progress.' },
};

// ─── Placeholder for unimplemented pages ──────────────────────────────────
function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
      <span
        className="material-symbols-rounded"
        style={{ fontSize: '48px', color: 'var(--color-primary)' }}
      >
        construction
      </span>
      <div className="text-center">
        <p className="label text-secondary">{title}</p>
        <p className="text-ui-sm text-muted mt-1">{subtitle}</p>
      </div>
    </div>
  );
}

// ─── Content router ────────────────────────────────────────────────────────
function renderContent(
  activeItem: SubPage,
  sessions: UIHost[],
  onSessionsChange: (hosts: UIHost[]) => void,
  onSavedHostAdded: () => void,
  onNavigateToTransferHistory: () => void,
  onNavigateToSessions: () => void,
  onNavigateToTransfers: () => void,
): React.ReactNode {
  if (activeItem === 'my-files') {
    return (
      <DashboardPage
        sessions={sessions}
        onNavigateToSessions={onNavigateToSessions}
        onNavigateToTransfers={onNavigateToTransfers}
      />
    );
  }

  if (activeItem === 'remote-hosts') {
    return (
      <RemoteHostsManagerPage
        sessions={sessions}
        onSessionsChange={onSessionsChange}
        onSavedHostAdded={onSavedHostAdded}
      />
    );
  }
  if (activeItem === 'transfer-history') {
    return (
      <TransferHistoryPage
        sessionIds={sessions.map(s => s.sessionId)}
      />
    );
  }
  if (activeItem === 'transfer-log') {
    return <TransferLogPage />;
  }
  if (activeItem === 'upload-sessions') {
    return <UploadSessionsPage />;
  }
  void onNavigateToTransferHistory; // suppress unused warning
  void onNavigateToSessions;
  void onNavigateToTransfers;
  const meta = BREADCRUMBS[activeItem];
  return <PlaceholderPage title={meta.title} subtitle={meta.subtitle} />;
}

// ─── HomePage ──────────────────────────────────────────────────────────────
export function HomePage() {
  const { user, logout } = useAuthStore();
  const [activeNav, setActiveNav] = useState<SubPage>(getSubPage);

  // ── Single source of truth for sessions ───────────────────────────────
  const [sessions, setSessions] = useState<UIHost[]>([]);
  const fetchedOnce = useRef(false);

  // Stable array of session IDs — memoized so TransferProgressPopup doesn't
  // re-run its effects on every unrelated render of HomePage.
  const sessionIds = useMemo(() => sessions.map(s => s.sessionId), [sessions]);

  // ── Saved host configurations (sidebar) ───────────────────────────────
  const [savedHostConfigs, setSavedHostConfigs] = useState<SavedHostResponse[]>([]);
  const [connectingConfigId, setConnectingConfigId] = useState<string | null>(null);
  const [deletingConfigId, setDeletingConfigId]     = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const raw: SessionState[] = await remoteConnectionAPI.listSessions();
      setSessions(
        raw.map(s => ({
          sessionId:     s.sessionId,
          name:          `${s.host}:${s.port}`,
          status:        s.state === 'ACTIVE' ? ('online' as const) : ('offline' as const),
          userAtIp:      `${s.username}@${s.host}`,
          protocol:      s.protocol,
          port:          s.port,
          lastConnected: new Date(s.createdAt).toLocaleTimeString(),
          latency:       0,
        }))
      );
    } catch {
      // non-critical — page-level error handled by child
    }
  }, []);

  // Run exactly once on mount (guards against React Strict Mode double-invoke)
  useEffect(() => {
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;
    void refreshSessions();
    void reloadSavedConfigs();
  }, [refreshSessions]);

  const reloadSavedConfigs = useCallback(async () => {
    try {
      const hosts = await remoteConnectionAPI.listSavedHosts();
      setSavedHostConfigs(hosts);
    } catch {
      // Non-fatal
    }
  }, []);

  const handleConnectConfig = useCallback(async (id: string) => {
    try {
      setConnectingConfigId(id);
      const response = await remoteConnectionAPI.connectSavedHost(id);
      setSessions(prev => [
        ...prev,
        {
          sessionId:     response.sessionId,
          name:          response.label ?? `${response.host}:${response.port}`,
          status:        'online' as const,
          userAtIp:      `${response.username}@${response.host}`,
          protocol:      response.protocol,
          port:          response.port,
          lastConnected: new Date(response.createdAt).toLocaleTimeString(),
          latency:       0,
        },
      ]);
      // Refresh to update lastUsed timestamp
      void reloadSavedConfigs();
    } catch (err) {
      console.error(getErrorMessage(err, 'Failed to connect to saved host'));
    } finally {
      setConnectingConfigId(null);
    }
  }, [reloadSavedConfigs]);

  const handleDeleteConfig = useCallback(async (id: string) => {
    try {
      setDeletingConfigId(id);
      await remoteConnectionAPI.deleteSavedHost(id);
      setSavedHostConfigs(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      console.error(getErrorMessage(err, 'Failed to delete saved host'));
    } finally {
      setDeletingConfigId(null);
    }
  }, []);

  // Derive saved-hosts list for the sidebar from the shared sessions state
  const savedHosts: SavedHost[] = sessions.map(s => ({
    id:     s.sessionId,
    label:  s.name.split(':')[0],   // just the hostname
    status: s.status,
  }));

  const handleNavSelect = (id: string) => {
    if (id.startsWith('host:')) return;
    const next = id as SubPage;
    setActiveNav(next);
    setSubPageUrl(next);
  };

  const handleShowAllSavedHosts = () => {
    setActiveNav('saved-hosts');
    setSubPageUrl('saved-hosts');
  };

  const handleNavigateToTransferHistory = () => {
    setActiveNav('transfer-history');
    setSubPageUrl('transfer-history');
  };

  const handleNavigateToSessions = () => {
    setActiveNav('remote-hosts');
    setSubPageUrl('remote-hosts');
  };

  const handleLogout = async () => {
    await logout();
    window.location.replace('?page=login');
  };

  const crumb = BREADCRUMBS[activeNav];

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--color-bg-base)' }}>

      {/* ── Sidebar ── */}
      <Sidebar
        activeItem={activeNav}
        onSelectItem={handleNavSelect}
        savedHosts={savedHosts}
        savedHostConfigs={savedHostConfigs}
        activeSessions={savedHosts}
        connectingConfigId={connectingConfigId}
        deletingConfigId={deletingConfigId}
        onConnectConfig={handleConnectConfig}
        onDeleteConfig={handleDeleteConfig}
        onShowAllSavedHosts={handleShowAllSavedHosts}
      />

      {/* ── Right column ── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* ── Top Header ── */}
        <header
          className="h-14 shrink-0 flex items-center justify-between px-6 gap-4"
          style={{
            background:   'var(--color-surface)',
            borderBottom: '1px solid var(--color-border-muted)',
          }}
        >
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-meta">
            {crumb.parts.map((part, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && (
                  <span
                    className="material-symbols-rounded"
                    style={{ fontSize: '14px', color: '#5a6380' }}
                  >
                    chevron_right
                  </span>
                )}
                <span
                  className={
                    i === crumb.parts.length - 1
                      ? 'text-primary'
                      : 'text-secondary hover:text-primary cursor-pointer transition-colors'
                  }
                >
                  {part}
                </span>
              </span>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <span
                className="material-symbols-rounded absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ fontSize: '15px', color: '#5a6380' }}
              >
                search
              </span>
              <input
                type="text"
                placeholder="Search hosts..."
                className="bg-[#0C0C14] border border-[#1E1E2E] rounded pl-8 pr-3 py-1.5 text-code text-primary placeholder:text-muted focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all w-52"
              />
            </div>

            {/* Notification bell */}
            <button className="p-1.5 hover:bg-white/5 rounded transition-colors relative cursor-pointer">
              <span className="material-symbols-rounded text-slate-400" style={{ fontSize: '20px' }}>
                notifications
              </span>
              <span
                className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--color-primary)' }}
              />
            </button>

            {/* Divider */}
            <span className="w-px h-5 bg-[#1E1E2E]" />

            {/* Username */}
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-status-ok)' }} />
              <span className="text-meta text-secondary">
                {user?.username ?? 'user'}
              </span>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer text-micro border transition-all duration-150 hover:bg-white/5"
              style={{ borderColor: 'var(--color-border-muted)', color: '#5a6380' }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: '14px', lineHeight: 1 }}>
                logout
              </span>
              Sign out
            </button>
          </div>
        </header>

        {/* ── Content area ── */}
        <main
          className="flex-1 overflow-auto custom-scrollbar h-0"
          style={{ background: 'var(--color-bg-base)' }}
        >
          {activeNav === 'saved-hosts'
            ? (
              <SavedHostsPage
                savedHostConfigs={savedHostConfigs}
                connectingConfigId={connectingConfigId}
                deletingConfigId={deletingConfigId}
                onConnect={handleConnectConfig}
                onDelete={handleDeleteConfig}
              />
            )
            : renderContent(activeNav, sessions, setSessions, reloadSavedConfigs, handleNavigateToTransferHistory, handleNavigateToSessions, handleNavigateToTransferHistory)
          }
        </main>
      </div>

      {/* ── Global transfer progress popup (floats above all content) ── */}
      <TransferProgressPopup
        sessionIds={sessionIds}
        onViewAll={handleNavigateToTransferHistory}
      />
    </div>
  );
}