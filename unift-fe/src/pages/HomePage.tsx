import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Sidebar } from '@/components/layout';
import type { SavedHost } from '@/components/layout';
import { RemoteHostsManagerPage } from './RemoteHostsManagerPage';
import { remoteConnectionAPI, type SessionState } from '@/utils/remoteConnectionAPI';
import type { UIHost } from './RemoteHostsManagerPage';

// ─── Valid subpage ids ─────────────────────────────────────────────────────
type SubPage =
  | 'my-files'
  | 'remote-hosts'
  | 'streaming'
  | 'recent'
  | 'starred'
  | 'shared'
  | 'trash';

const VALID_SUBPAGES: SubPage[] = [
  'my-files', 'remote-hosts', 'streaming', 'recent', 'starred', 'shared', 'trash',
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
  'my-files':     { parts: ['Home', 'My Files'],                   title: 'My Files',     subtitle: 'Browse your local files.' },
  'remote-hosts': { parts: ['Home', 'Remote Host', 'Connections'], title: 'Remote Hosts', subtitle: 'Manage SFTP, FTP, and SMB connections to remote servers.' },
  'streaming':    { parts: ['Home', 'Streaming'],                  title: 'Streaming',    subtitle: 'Stream media from remote sources.' },
  'recent':       { parts: ['Home', 'Recent'],                     title: 'Recent',       subtitle: 'Recently accessed files.' },
  'starred':      { parts: ['Home', 'Starred'],                    title: 'Starred',      subtitle: 'Your starred items.' },
  'shared':       { parts: ['Home', 'Shared'],                     title: 'Shared',       subtitle: 'Files shared with you.' },
  'trash':        { parts: ['Home', 'Trash'],                      title: 'Trash',        subtitle: 'Deleted files.' },
};

// ─── Placeholder for unimplemented pages ──────────────────────────────────
function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '48px', color: 'var(--color-primary)' }}
      >
        construction
      </span>
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-slate-300">{title}</p>
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      </div>
    </div>
  );
}

// ─── Content router ────────────────────────────────────────────────────────
function renderContent(
  activeItem: SubPage,
  sessions: UIHost[],
  onSessionsChange: (hosts: UIHost[]) => void,
): React.ReactNode {
  if (activeItem === 'remote-hosts') {
    return (
      <RemoteHostsManagerPage
        sessions={sessions}
        onSessionsChange={onSessionsChange}
      />
    );
  }
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
  }, [refreshSessions]);

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
          <nav className="flex items-center gap-1 text-xs font-mono text-slate-400">
            {crumb.parts.map((part, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '14px', color: '#5a6380' }}
                  >
                    chevron_right
                  </span>
                )}
                <span
                  className={
                    i === crumb.parts.length - 1
                      ? 'font-semibold text-[#E2E8F0]'
                      : 'hover:text-slate-200 cursor-pointer transition-colors'
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
                className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ fontSize: '15px', color: '#5a6380' }}
              >
                search
              </span>
              <input
                type="text"
                placeholder="Search hosts..."
                className="bg-[#11141C] border border-[#2E3348] rounded pl-8 pr-3 py-1.5 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all w-52"
              />
            </div>

            {/* Notification bell */}
            <button className="p-1.5 hover:bg-white/5 rounded transition-colors relative cursor-pointer">
              <span className="material-symbols-outlined text-slate-400" style={{ fontSize: '20px' }}>
                notifications
              </span>
              <span
                className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--color-primary)' }}
              />
            </button>

            {/* Divider */}
            <span className="w-px h-5 bg-[#2E3348]" />

            {/* Username */}
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-status-ok)' }} />
              <span className="font-mono text-[11px]" style={{ color: '#5a6380' }}>
                {user?.username ?? 'user'}
              </span>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer font-mono text-[10px] uppercase tracking-widest border transition-all duration-150 hover:bg-white/5"
              style={{ borderColor: 'var(--color-border-muted)', color: '#5a6380' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px', lineHeight: 1 }}>
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
          {renderContent(activeNav, sessions, setSessions)}
        </main>
      </div>
    </div>
  );
}