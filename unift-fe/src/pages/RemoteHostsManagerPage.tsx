import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  remoteConnectionAPI,
  type SessionState,
  type ConnectRequest,
  type TestConnectionResponse,
} from '@/utils/remoteConnectionAPI';
import { getErrorMessage } from '@/utils/apiClient';
import { Icon } from './RemoteHostsManager/shared';
import { FileBrowser } from './RemoteHostsManager/FileBrowser';
import { NewConnectionModal } from './RemoteHostsManager/NewConnectionModal';
import { HostListView } from './RemoteHostsManager/HostListView';
import { HostGridView } from './RemoteHostsManager/HostGridView';
import { TerminalPanel } from './RemoteHostsManager/TerminalPanel';
import { SessionDetailPage } from './RemoteHostsManager/SessionDetailPage';
import type { UIHost, ProtocolType, StatusFilter, ConnectionFormData } from './RemoteHostsManager/types';
import type { SshAuthType } from '@/utils/remoteConnectionAPI';

export type { UIHost };

type RemoteView = 'analytics' | 'browser';

function getRemoteViewFromUrl(): { view: RemoteView; sessionId: string } | null {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') as RemoteView | null;
  const sessionId = params.get('sessionId');
  if ((view === 'analytics' || view === 'browser') && sessionId) {
    return { view, sessionId };
  }
  return null;
}

function pushRemoteViewUrl(view: RemoteView, sessionId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('view', view);
  url.searchParams.set('sessionId', sessionId);
  window.history.pushState(null, '', url.toString());
}

function clearRemoteViewUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('view');
  url.searchParams.delete('sessionId');
  window.history.pushState(null, '', url.toString());
}

interface RemoteHostsManagerPageProps {
  sessions:              UIHost[];
  onSessionsChange:      (hosts: UIHost[]) => void;
  openNewConnection?:    boolean;
  onNewConnectionClose?: () => void;
  onSavedHostAdded?:     () => void;
}

const EMPTY_FORM: ConnectionFormData = {
  name:                   '',
  host:                   '',
  port:                   '22',
  username:               '',
  password:               '',
  privateKey:             '',
  passphrase:             '',
  remotePath:             '',
  sessionTtlMinutes:      '',
  strictHostKeyChecking:  false,
  expectedFingerprint:    '',
  saveConnection:         false,
  autoReconnect:          false,
};

export function RemoteHostsManagerPage({
  sessions,
  onSessionsChange,
  openNewConnection = false,
  onNewConnectionClose,
  onSavedHostAdded,
}: RemoteHostsManagerPageProps) {
  const [selectedProtocol, setSelectedProtocol] = useState<ProtocolType>('SSH_SFTP');
  const [statusFilter, setStatusFilter]         = useState<StatusFilter>('all');
  const [viewMode, setViewMode]                 = useState<'list' | 'grid'>('list');
  const [authType, setAuthType]                 = useState<SshAuthType>('PASSWORD');
  const [showModal, setShowModal]               = useState(false);

  // Sync external open trigger (e.g. header button in HomePage)
  useEffect(() => {
    if (openNewConnection) setShowModal(true);
  }, [openNewConnection]);

  const closeModal = () => {
    setShowModal(false);
    onNewConnectionClose?.();
  };

  // File browser: which session (if any) is open
  const [browserHost, setBrowserHost] = useState<UIHost | null>(null);

  // Analytics detail page: which session (if any) is open
  const [analyticsHost, setAnalyticsHost] = useState<UIHost | null>(null);

  // Restore overlay state from URL on first sessions load (handles page refresh)
  const hasSyncedFromUrl = useRef(false);
  useEffect(() => {
    if (hasSyncedFromUrl.current || sessions.length === 0) return;
    hasSyncedFromUrl.current = true;
    const urlState = getRemoteViewFromUrl();
    if (!urlState) return;
    const host = sessions.find(s => s.sessionId === urlState.sessionId);
    if (!host) { clearRemoteViewUrl(); return; }
    if (urlState.view === 'analytics') setAnalyticsHost(host);
    else setBrowserHost(host);
  }, [sessions]);

  // Sync React state when the user navigates with browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const urlState = getRemoteViewFromUrl();
      if (!urlState) {
        setAnalyticsHost(null);
        setBrowserHost(null);
      } else {
        const host = sessions.find(s => s.sessionId === urlState.sessionId);
        if (!host) return;
        if (urlState.view === 'analytics') { setAnalyticsHost(host); setBrowserHost(null); }
        else { setBrowserHost(host); setAnalyticsHost(null); }
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [sessions]);

  // URL-aware wrappers — always call these instead of the raw setters
  const openAnalytics = (host: UIHost) => {
    pushRemoteViewUrl('analytics', host.sessionId);
    setAnalyticsHost(host);
  };
  const closeAnalytics = () => {
    clearRemoteViewUrl();
    setAnalyticsHost(null);
  };
  const openBrowser = (host: UIHost) => {
    pushRemoteViewUrl('browser', host.sessionId);
    setBrowserHost(host);
  };
  const closeBrowser = () => {
    clearRemoteViewUrl();
    setBrowserHost(null);
    // Close the terminal panel when leaving the connection — the session context is gone
    setTerminalOpen(false);
    setTerminalMinimized(false);
    setTerminalSessionId(undefined);
  };

  // IDE-style terminal panel
  const [terminalOpen, setTerminalOpen]           = useState(false);
  const [terminalHeight, setTerminalHeight]       = useState(280);
  const [terminalMinimized, setTerminalMinimized] = useState(false);
  const [terminalSessionId, setTerminalSessionId] = useState<string | undefined>();

  const [formData, setFormData]         = useState<ConnectionFormData>(EMPTY_FORM);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [testResult, setTestResult]     = useState<TestConnectionResponse | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Terminal resize via drag handle
  const handleTerminalResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY      = e.clientY;
    const startHeight = terminalHeight;
    const onMouseMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      setTerminalHeight(Math.max(120, Math.min(600, startHeight + delta)));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Open a terminal session for the currently active connection.
  // Only callable from within the file browser, so browserHost is always set.
  const openTerminal = () => {
    if (!browserHost) return;
    setTerminalSessionId(browserHost.sessionId);
    setTerminalOpen(true);
    setTerminalMinimized(false);
  };

  // Reload sessions from the server and push the result up to the parent
  const reloadSessions = async () => {
    try {
      setLoading(true);
      const activeSessions = await remoteConnectionAPI.listSessions();
      onSessionsChange(
        activeSessions.map((s: SessionState) => ({
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
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load sessions'));
    } finally {
      setLoading(false);
    }
  };

  // Filter and count helpers
  const filteredHosts = useMemo(() => {
    if (statusFilter === 'all') return sessions;
    return sessions.filter(h => h.status === statusFilter);
  }, [statusFilter, sessions]);

  const statusCounts = {
    all:     sessions.length,
    online:  sessions.filter(h => h.status === 'online').length,
    offline: sessions.filter(h => h.status === 'offline').length,
    warning: sessions.filter(h => h.status === 'warning').length,
  };

  const avgLatency = useMemo(() => {
    const live = sessions.filter(s => s.status === 'online' && s.latency > 0);
    if (live.length === 0) return null;
    return Math.round(live.reduce((acc, s) => acc + s.latency, 0) / live.length);
  }, [sessions]);

  const sessionHealthPct = sessions.length === 0
    ? 100
    : Math.round((statusCounts.online / sessions.length) * 100);

  const handleFormChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTestConnection = async () => {
    if (!formData.host || !formData.username) {
      setError('Host and username are required');
      return;
    }
    if (authType === 'PASSWORD' && !formData.password) {
      setError('Password is required');
      return;
    }
    if (authType !== 'PASSWORD' && !formData.privateKey) {
      setError('SSH Key is required');
      return;
    }

    try {
      setTestingConnection(true);
      setTestResult(null);

      const connectRequest: ConnectRequest = {
        protocol:              selectedProtocol,
        host:                  formData.host,
        port:                  parseInt(formData.port),
        username:              formData.username,
        sshAuthType:           authType,
        sessionTtlMinutes:     0,
        strictHostKeyChecking: formData.strictHostKeyChecking,
        ...(formData.strictHostKeyChecking && formData.expectedFingerprint.trim() && {
          expectedFingerprint: formData.expectedFingerprint.trim(),
        }),
        ...(authType === 'PASSWORD'              && { password: formData.password }),
        ...(authType === 'PRIVATE_KEY'           && { privateKey: formData.privateKey }),
        ...(authType === 'PRIVATE_KEY_PASSPHRASE' && {
          privateKey: formData.privateKey,
          passphrase: formData.passphrase,
        }),
      };

      const result = await remoteConnectionAPI.testConnection(connectRequest);
      setTestResult(result);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Connection test failed'));
      setTestResult({
        success:  false,
        message:  getErrorMessage(err, 'Connection test failed'),
        protocol: selectedProtocol,
        host:     formData.host,
        port:     parseInt(formData.port),
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleConnect = async () => {
    if (!formData.host || !formData.username) {
      setError('Host and username are required');
      return;
    }
    if (authType === 'PASSWORD' && !formData.password) {
      setError('Password is required');
      return;
    }
    if (authType !== 'PASSWORD' && !formData.privateKey) {
      setError('SSH Key is required');
      return;
    }

    try {
      setLoading(true);

      const connectRequest: ConnectRequest = {
        protocol:              selectedProtocol,
        host:                  formData.host,
        port:                  parseInt(formData.port),
        username:              formData.username,
        sshAuthType:           authType,
        sessionTtlMinutes:     formData.sessionTtlMinutes ? parseInt(formData.sessionTtlMinutes) : 30,
        strictHostKeyChecking: formData.strictHostKeyChecking,
        ...(formData.strictHostKeyChecking && formData.expectedFingerprint.trim() && {
          expectedFingerprint: formData.expectedFingerprint.trim(),
        }),
        ...(authType === 'PASSWORD'              && { password: formData.password }),
        ...(authType === 'PRIVATE_KEY'           && { privateKey: formData.privateKey }),
        ...(authType === 'PRIVATE_KEY_PASSPHRASE' && {
          privateKey: formData.privateKey,
          passphrase: formData.passphrase,
        }),
      };

      await remoteConnectionAPI.connect(connectRequest);

      // Save the host config if the user opted in
      if (formData.saveConnection) {
        try {
          await remoteConnectionAPI.saveSavedHost({
            label:                 formData.name.trim() || undefined,
            protocol:              selectedProtocol,
            hostname:              formData.host,
            port:                  parseInt(formData.port),
            username:              formData.username,
            authType:              authType,
            strictHostKeyChecking: formData.strictHostKeyChecking,
            ...(formData.strictHostKeyChecking && formData.expectedFingerprint.trim() && {
              expectedFingerprint: formData.expectedFingerprint.trim(),
            }),
            ...(authType === 'PASSWORD'              && { password: formData.password }),
            ...(authType === 'PRIVATE_KEY'           && { privateKey: formData.privateKey }),
            ...(authType === 'PRIVATE_KEY_PASSPHRASE' && {
              privateKey: formData.privateKey,
              passphrase: formData.passphrase,
            }),
          });
          onSavedHostAdded?.();
        } catch {
          // Non-fatal — the session opened successfully, saving the config is best-effort
          console.warn('Failed to save host configuration');
        }
      }

      await reloadSessions();
      setFormData(EMPTY_FORM);
      setError(null);
      closeModal();
    } catch (err) {
      setError(getErrorMessage(err, 'Connection failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    try {
      setLoading(true);
      await remoteConnectionAPI.closeSession(sessionId);
      onSessionsChange(sessions.filter(h => h.sessionId !== sessionId));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to disconnect'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="h-full flex flex-col bg-[#0C0C14] relative">

        {/* Analytics detail full-page overlay */}
        {analyticsHost && (
          <SessionDetailPage
            host={analyticsHost}
            onBack={closeAnalytics}
            onDisconnect={async (sessionId) => {
              await handleDisconnect(sessionId);
              closeAnalytics();
            }}
            onOpenTerminal={() => {
              closeAnalytics();
              openTerminal();
            }}
          />
        )}

        {/* File Browser full-page overlay */}
        {browserHost && (
          <div className="absolute inset-0 z-20 flex flex-col bg-[#0C0C14]">
            {/* Breadcrumb back bar */}
            <div className="flex items-center gap-3 px-8 py-4 border-b border-[#1E1E2E] shrink-0">
              <button
                onClick={closeBrowser}
                className="flex items-center gap-1.5 text-muted hover:text-primary transition-colors cursor-pointer"
              >
                <Icon name="arrow_back" className="text-base" />
                <span className="text-micro text-secondary">Active Sessions</span>
              </button>
              <Icon name="chevron_right" className="text-sm text-slate-700" />
              <span className="text-meta text-primary truncate">
                {browserHost.name.split(':')[0]}
              </span>
              <span className="ml-auto px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/30 text-micro text-emerald-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#4ade80]" />
                CONNECTED
              </span>
            </div>

            {/* FileBrowser fills the remaining vertical space above the terminal */}
            <div className="flex-1 overflow-hidden">
              <FileBrowser
                host={browserHost}
                onClose={closeBrowser}
                onSessionExpired={() => {
                  onSessionsChange(sessions.filter(h => h.sessionId !== browserHost.sessionId));
                  closeBrowser();
                }}
                onOpenTerminal={openTerminal}
              />
            </div>

            {/* Terminal panel — sits at the bottom of the file browser overlay */}
            <TerminalPanel
              sessions={sessions}
              terminalOpen={terminalOpen}
              terminalMinimized={terminalMinimized}
              terminalHeight={terminalHeight}
              terminalSessionId={terminalSessionId}
              onResizeMouseDown={handleTerminalResizeMouseDown}
              onClose={() => setTerminalOpen(false)}
              onToggleMinimize={() => setTerminalMinimized(v => !v)}
            />
          </div>
        )}

        {/* Page Header */}
        <div className="px-8 pt-7 pb-5 flex items-start justify-between shrink-0 border-b border-[#1E1E2E]">
          <div>
            <p className="label text-muted mb-1.5">
              Infrastructure Management
            </p>
            <h1 className="text-display" style={{ fontSize: '26px' }}>
              Active Sessions
            </h1>
            <p className="text-ui-sm text-secondary mt-1.5">
              Monitor and manage concurrent server connections across the cluster.
            </p>
          </div>
          <div className="flex items-center gap-2.5 mt-1">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#252D45] text-ui-sm text-primary hover:border-slate-600 transition-colors cursor-pointer">
              <Icon name="filter_list" className="text-sm" />
              Filter
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg brand-gradient brand-gradient-hover brand-gradient-shadow text-micro text-on-brand cursor-pointer"
            >
              <Icon name="add" className="text-sm" />
              New Session
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="px-8 py-5 grid grid-cols-4 gap-4 shrink-0 border-b border-[#1E1E2E]">
          <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
            <p className="text-micro text-muted mb-2">Active Links</p>
            <div className="flex items-baseline gap-2">
              <span className="text-display" style={{ fontSize: '24px' }}>{statusCounts.online}</span>
              <span className="text-meta text-muted">/ {sessions.length} slots</span>
            </div>
          </div>
          <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
            <p className="text-micro text-muted mb-2">Total Bandwidth</p>
            <div className="flex items-baseline gap-2">
              <span className="text-display" style={{ fontSize: '24px' }}>—</span>
              <span className="text-meta text-muted">GB/s</span>
            </div>
          </div>
          <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
            <p className="text-micro text-muted mb-2">Avg Latency</p>
            <div className="flex items-baseline gap-2">
              <span className="text-display" style={{ fontSize: '24px' }}>
                {avgLatency !== null ? avgLatency : '—'}
              </span>
              <span className="text-meta text-muted">ms</span>
            </div>
          </div>
          <div className="bg-[#0F0F1A] border border-[#13131E] rounded-xl p-4">
            <p className="text-micro text-muted mb-2">Session Health</p>
            <div className="flex items-baseline gap-2">
              <span className={`text-display ${
                sessionHealthPct >= 80 ? 'text-emerald-400' :
                sessionHealthPct >= 50 ? 'text-amber-400' : 'text-red-400'
              }`} style={{ fontSize: '24px' }}>
                {sessionHealthPct}%
              </span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex gap-6 px-8 py-5">
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">

              {/* Toolbar row */}
              <div className="flex items-center justify-between shrink-0">
                {/* Status Tabs */}
                <div className="flex gap-0.5 items-center bg-[#0F0F1A] border border-[#13131E] rounded-lg p-1 w-fit">
                  {(['all', 'online', 'offline', 'warning'] as const).map(status => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-4 py-1.5 rounded-md text-micro transition-all cursor-pointer ${
                        statusFilter === status
                            ? 'brand-gradient text-on-brand shadow-sm'
                          : 'text-muted hover:text-secondary'
                      }`}
                      
                    >
                      {status === 'all' ? 'All' :
                       status === 'online' ? 'Online' :
                       status === 'offline' ? 'Offline' : 'Warning'}
                      {' '}
                      <span className={statusFilter === status ? 'text-accent-soft' : 'text-muted'}>
                        ({statusCounts[status]})
                      </span>
                    </button>
                  ))}
                </div>

                {/* Right side: view toggle + reload */}
                <div className="flex items-center gap-2.5">
                  <div className="flex gap-0.5 bg-[#0F0F1A] border border-[#13131E] rounded-lg p-1">
                    {(['list', 'grid'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                          viewMode === mode
                            ? 'brand-gradient text-on-brand'
                            : 'text-muted hover:text-secondary'
                        }`}
                      >
                        <Icon name={mode === 'list' ? 'list' : 'grid_on'} className="text-base" />
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={reloadSessions}
                    disabled={loading}
                    className="p-2 rounded-lg border border-[#13131E] bg-[#0F0F1A] text-muted hover:text-secondary hover:border-slate-600 transition-colors cursor-pointer disabled:opacity-50"
                    title="Reload sessions"
                  >
                    <Icon name="refresh" className="text-base" />
                  </button>
                </div>
              </div>

              {/* Host List / Grid */}
              <div className={`flex-1 overflow-y-auto custom-scrollbar ${
                viewMode === 'grid'
                  ? 'grid grid-cols-2 xl:grid-cols-3 gap-3 content-start'
                  : 'space-y-0'
              }`}>
                {viewMode === 'list' ? (
                  <HostListView
                    hosts={filteredHosts}
                    loading={loading}
                    onBrowse={openBrowser}
                    onDisconnect={handleDisconnect}
                    onAnalytics={openAnalytics}
                  />
                ) : (
                  <HostGridView
                    hosts={filteredHosts}
                    loading={loading}
                    onBrowse={openBrowser}
                    onDisconnect={handleDisconnect}
                  />
                )}
              </div>

              {/* Pagination + Bottom Action Cards */}
              <div className="shrink-0 space-y-4">
                {/* Pagination row */}
                <div className="flex items-center justify-between py-2 border-t border-[#1E1E2E]">
                  <p className="text-meta text-muted">
                    Showing {filteredHosts.length} of {sessions.length} sessions
                  </p>
                  <div className="flex items-center gap-1">
                    <button className="w-7 h-7 flex items-center justify-center rounded border border-[#13131E] text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors cursor-pointer">
                      <Icon name="chevron_left" className="text-sm" />
                    </button>
                    <button className="w-7 h-7 flex items-center justify-center rounded border border-[#13131E] text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors cursor-pointer">
                      <Icon name="chevron_right" className="text-sm" />
                    </button>
                  </div>
                </div>

                {/* Bottom Action Cards */}
                <button
                  onClick={openTerminal}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-[#0F0F1A] border border-[#13131E] hover:border-slate-600/50 transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-800/70 border border-slate-700/40 flex items-center justify-center shrink-0">
                      <Icon name="history" className="text-base text-slate-400" />
                    </div>
                    <div>
                      <p className="text-title">View Session Logs</p>
                      <p className="text-ui-sm text-muted mt-0.5">
                        Audit all terminal commands and file transfers from previous sessions.
                      </p>
                    </div>
                  </div>
                  <Icon name="arrow_forward" className="text-base text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 ml-3" />
                </button>
              </div>
            </div>
        </div>

      </div>

      {/* New Connection Modal */}
      {showModal && (
        <NewConnectionModal
          selectedProtocol={selectedProtocol}
          authType={authType}
          formData={formData}
          loading={loading}
          testingConnection={testingConnection}
          error={error}
          testResult={testResult}
          onClose={closeModal}
          onProtocolChange={setSelectedProtocol}
          onAuthTypeChange={setAuthType}
          onFormChange={handleFormChange}
          onTestConnection={handleTestConnection}
          onConnect={handleConnect}
          onClearError={() => setError(null)}
        />
      )}
    </>
  );
}
