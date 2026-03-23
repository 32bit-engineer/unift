import React, { useState, useMemo, useEffect } from 'react';
import {
  remoteConnectionAPI,
  type SessionState,
  type ConnectRequest,
  type TestConnectionResponse,
  type SavedHostResponse,
} from '@/utils/remoteConnectionAPI';
import { getErrorMessage } from '@/utils/apiClient';
import { Icon } from './RemoteHostsManager/shared';
import { FileBrowser } from './RemoteHostsManager/FileBrowser';
import { NewConnectionModal } from './RemoteHostsManager/NewConnectionModal';
import { HostListView } from './RemoteHostsManager/HostListView';
import { HostGridView } from './RemoteHostsManager/HostGridView';
import { TerminalPanel } from './RemoteHostsManager/TerminalPanel';
import { SavedHostsSection } from './RemoteHostsManager/SavedHostsSection';
import type { UIHost, ProtocolType, StatusFilter, ConnectionFormData } from './RemoteHostsManager/types';
import type { SshAuthType } from '@/utils/remoteConnectionAPI';

export type { UIHost };

interface RemoteHostsManagerPageProps {
  sessions:              UIHost[];
  onSessionsChange:      (hosts: UIHost[]) => void;
  openNewConnection?:    boolean;
  onNewConnectionClose?: () => void;
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

  // Saved hosts
  const [savedHosts, setSavedHosts]       = useState<SavedHostResponse[]>([]);
  const [connectingId, setConnectingId]   = useState<string | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);

  // Terminal session sync
  useEffect(() => {
    const active = sessions.filter(s => s.status === 'online');
    if (active.length > 0) {
      if (!terminalSessionId || !active.some(s => s.sessionId === terminalSessionId)) {
        setTerminalSessionId(active[0].sessionId);
      }
    } else {
      if (terminalSessionId) setTerminalSessionId(undefined);
    }
  }, [sessions]);

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

  /*
   * Open the terminal panel and auto-select the most relevant session.
   * Prefers the currently open file-browser host, then falls back to
   * the first online session.
   */
  const openTerminal = () => {
    setTerminalOpen(true);
    setTerminalMinimized(false);
    if (!terminalSessionId) {
      const candidate = browserHost ?? sessions.find(s => s.status === 'online') ?? null;
      if (candidate) setTerminalSessionId(candidate.sessionId);
    }
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

  // Load saved host configurations from the server
  const reloadSavedHosts = async () => {
    try {
      const hosts = await remoteConnectionAPI.listSavedHosts();
      setSavedHosts(hosts);
    } catch {
      // Non-fatal — saved hosts are a convenience feature
    }
  };

  // Load saved hosts on mount
  useEffect(() => {
    reloadSavedHosts();
  }, []);

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

  const activeSessions = sessions.filter(s => s.status === 'online');

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
          await reloadSavedHosts();
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

  // Connect using stored (encrypted) credentials for a saved host
  const handleConnectSaved = async (id: string) => {
    try {
      setConnectingId(id);
      const response = await remoteConnectionAPI.connectSavedHost(id);
      onSessionsChange([
        ...sessions,
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
      // Refresh saved hosts to update lastUsed timestamp
      await reloadSavedHosts();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to connect to saved host'));
    } finally {
      setConnectingId(null);
    }
  };

  // Remove a saved host configuration (does not affect active sessions)
  const handleDeleteSaved = async (id: string) => {
    try {
      setDeletingId(id);
      await remoteConnectionAPI.deleteSavedHost(id);
      setSavedHosts(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete saved host'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="h-full flex flex-col bg-[#161923]">

        {/* Page Title Bar */}
        <div className="px-6 pt-6 pb-2 flex items-start justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase text-slate-100">Remote Hosts</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage SFTP, FTP, and SMB connections to remote servers.
            </p>
          </div>
          {/* Summary badges */}
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono badge-done">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
              {statusCounts.online} Online
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono badge-queue">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              {statusCounts.offline} Offline
            </span>
            {statusCounts.warning > 0 && (
              <span
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono badge-active"
                style={{ color: '#E07B39', background: 'rgba(224,123,57,0.12)', borderColor: 'rgba(224,123,57,0.28)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#E07B39]" />
                {statusCounts.warning} Warning
              </span>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex gap-6 p-6 pt-4">

          {/* Full-width: File Browser OR Session List */}
          {browserHost ? (
            <FileBrowser
              host={browserHost}
              onClose={() => setBrowserHost(null)}
              onSessionExpired={() => {
                onSessionsChange(sessions.filter(h => h.sessionId !== browserHost.sessionId));
                setBrowserHost(null);
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">

              {/* Toolbar row */}
              <div className="flex items-center justify-between">
                {/* Status Tabs */}
                <div className="flex gap-1 items-center bg-[#1E2130] rounded p-1 w-fit">
                  {(['all', 'online', 'offline', 'warning'] as const).map(status => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-4 py-2 rounded text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
                        statusFilter === status
                          ? 'bg-[#4F8EF7] text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {status === 'all' ? 'All' :
                       status === 'online' ? 'Online' :
                       status === 'offline' ? 'Offline' : 'Warning'}
                      {' '}
                      <span className="font-bold">({statusCounts[status]})</span>
                    </button>
                  ))}
                </div>

                {/* Right side: view toggle + sort + new connection */}
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    {(['list', 'grid'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`p-2 rounded transition-colors cursor-pointer ${
                          viewMode === mode
                            ? 'bg-[#4F8EF7] text-white'
                            : 'bg-[#1E2130] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Icon name={mode === 'list' ? 'list' : 'grid_on'} className="text-base" />
                      </button>
                    ))}
                  </div>
                  <button className="flex items-center gap-2 px-3 py-2 text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors cursor-pointer">
                    <Icon name="sort" className="text-sm" />
                    Sort
                  </button>
                  <div className="w-px h-5 bg-[#2E3348]" />
                  <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#4F8EF7] rounded text-[10px] font-bold uppercase tracking-widest text-white font-mono hover:brightness-110 transition-all cursor-pointer shadow-lg shadow-[#4F8EF7]/15"
                  >
                    <Icon name="add" className="text-sm" />
                    New Connection
                  </button>
                </div>
              </div>

              {/* Host List / Grid */}
              <div className={`flex-1 overflow-y-auto custom-scrollbar ${
                viewMode === 'grid'
                  ? 'grid grid-cols-2 xl:grid-cols-3 gap-3 content-start'
                  : 'space-y-1.5'
              }`}>
                {viewMode === 'list' ? (
                  <HostListView
                    hosts={filteredHosts}
                    loading={loading}
                    onBrowse={setBrowserHost}
                    onDisconnect={handleDisconnect}
                  />
                ) : (
                  <HostGridView
                    hosts={filteredHosts}
                    loading={loading}
                    onBrowse={setBrowserHost}
                    onDisconnect={handleDisconnect}
                  />
                )}

                {/* Saved hosts — rendered below active sessions in list mode */}
                {viewMode === 'list' && (
                  <div className="mt-4">
                    <SavedHostsSection
                      savedHosts={savedHosts}
                      connectingId={connectingId}
                      deletingId={deletingId}
                      onConnect={handleConnectSaved}
                      onDelete={handleDeleteSaved}
                    />
                  </div>
                )}
              </div>

              {/* Stats Footer */}
              <div className="bg-[#1E2130] border border-[#2E3348] rounded p-4 grid grid-cols-3 gap-6">
                <div>
                  <span className="label block mb-1">Total Sessions</span>
                  <span className="text-lg font-bold text-[#E2E8F0]">{sessions.length}</span>
                </div>
                <div>
                  <span className="label block mb-1">Active</span>
                  <span className="text-lg font-bold text-[#4ade80]">{statusCounts.online}</span>
                </div>
                <div>
                  <span className="label block mb-1">Inactive</span>
                  <span className="text-lg font-bold text-[#E07B39]">
                    {statusCounts.offline + statusCounts.warning}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* IDE Terminal Panel */}
        <TerminalPanel
          sessions={sessions}
          terminalOpen={terminalOpen}
          terminalMinimized={terminalMinimized}
          terminalHeight={terminalHeight}
          terminalSessionId={terminalSessionId}
          activeSessions={activeSessions}
          onResizeMouseDown={handleTerminalResizeMouseDown}
          onSessionChange={setTerminalSessionId}
          onClose={() => setTerminalOpen(false)}
          onToggleMinimize={() => setTerminalMinimized(v => !v)}
          onOpen={openTerminal}
        />
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
