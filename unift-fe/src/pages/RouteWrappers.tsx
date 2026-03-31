/**
 * Route-level wrapper components that bridge the global connection store
 * to existing page components that still accept props.
 *
 * This provides a safe migration path: existing pages continue to work
 * via props while the store provides the single source of truth.
 *
 * API mappings (for debugging):
 *   - DashboardRoute: reads sessions from connectionStore
 *   - SessionsRoute: reads sessions from connectionStore, provides refresh
 *   - InfrastructureRoute: reads savedHosts + sessions from connectionStore
 *   - WorkspaceRoute: reads session from connectionStore via URL param
 *   - SavedHostsRoute: reads savedHosts from connectionStore
 *   - TransferHistoryRoute: reads session IDs from connectionStore
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useConnectionStore } from '@/store/connectionStore';
import type { UISession } from '@/store/connectionStore';
import { DashboardPage } from './DashboardPage';
import { RemoteHostsManagerPage } from './RemoteHostsManagerPage';
import { ConnectionHubPage } from './ConnectionHubPage';
import { KineticWorkspacePage } from './KineticWorkspacePage';
import { SavedHostsPage } from './SavedHostsPage';
import { TransferHistoryPage } from './TransferHistoryPage';
import { DockerDashboardPage, DockerContainersPage, DockerImagesPage, DockerNetworksPage, DockerVolumesPage, DockerComposePage, DockerMonitoringPage, DockerLogsPage } from './docker';
import { K8sDashboardPage, K8sPodsPage, K8sDeploymentsPage, K8sServicesPage, K8sNodesPage, K8sIngressPage, K8sStatefulSetsPage, K8sDaemonSetsPage, K8sConfigMapsPage } from './kubernetes';
import { SshMonitoringPage } from './SshMonitoringPage';
import { SshLogsPage } from './SshLogsPage';
import type { UIHost } from './RemoteHostsManager/types';
import type { SavedHost } from '@/components/layout';

function toUIHost(s: UISession): UIHost {
  return {
    sessionId: s.sessionId,
    name: s.name,
    status: s.status,
    userAtIp: `${s.username}@${s.host}`,
    protocol: s.protocol,
    port: s.port,
    lastConnected: new Date(s.createdAt).toLocaleTimeString(),
    latency: 0,
  };
}

export function DashboardRoute() {
  const navigate = useNavigate();
  const sessions = useConnectionStore(s => s.sessions);
  const uiHosts = useMemo(() => sessions.map(toUIHost), [sessions]);

  return (
    <DashboardPage
      sessions={uiHosts}
      onNavigateToSessions={() => navigate('/sessions')}
      onNavigateToTransfers={() => navigate('/transfers/active')}
      onNewConnection={() => navigate('/sessions')}
      onOpenWorkspace={(sessionId) => navigate(`/workspace/${sessionId}`)}
    />
  );
}

export function SessionsRoute() {
  const sessions = useConnectionStore(s => s.sessions);
  const fetchSessions = useConnectionStore(s => s.fetchSessions);
  const fetchSavedHosts = useConnectionStore(s => s.fetchSavedHosts);
  const uiHosts = useMemo(() => sessions.map(toUIHost), [sessions]);

  const handleSessionsChange = useCallback((_hosts: UIHost[]) => {
    // Trigger a fresh fetch from server to sync store
    fetchSessions();
  }, [fetchSessions]);

  return (
    <RemoteHostsManagerPage
      sessions={uiHosts}
      onSessionsChange={handleSessionsChange}
      onSavedHostAdded={() => fetchSavedHosts()}
    />
  );
}

export function InfrastructureRoute() {
  const navigate = useNavigate();
  const sessions = useConnectionStore(s => s.sessions);
  const savedHostConfigs = useConnectionStore(s => s.savedHosts);
  const connectingHostId = useConnectionStore(s => s.connectingHostId);
  const deletingHostId = useConnectionStore(s => s.deletingHostId);
  const connectSavedHost = useConnectionStore(s => s.connectSavedHost);
  const deleteSavedHost = useConnectionStore(s => s.deleteSavedHost);
  const fetchSavedHosts = useConnectionStore(s => s.fetchSavedHosts);
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  const activeSessions: SavedHost[] = useMemo(
    () => sessions.map(s => ({ id: s.sessionId, label: s.name, status: s.status })),
    [sessions],
  );

  const handleConnect = useCallback(async (id: string) => {
    try {
      const session = await connectSavedHost(id);
      setActiveWorkspace(session.sessionId);
      navigate(`/workspace/${session.sessionId}`);
    } catch {
      // Error is set in store
    }
  }, [connectSavedHost, setActiveWorkspace, navigate]);

  const handleLaunchWorkspace = useCallback(async (cfg: import('@/utils/remoteConnectionAPI').SavedHostResponse) => {
    const displayName = cfg.label ?? cfg.hostname;
    const existing = sessions.find(
      s => s.name === displayName || s.name === cfg.hostname || s.host === cfg.hostname,
    );

    if (existing) {
      setActiveWorkspace(existing.sessionId);
      navigate(`/workspace/${existing.sessionId}`);
      return;
    }

    try {
      const session = await connectSavedHost(cfg.id);
      setActiveWorkspace(session.sessionId);
      navigate(`/workspace/${session.sessionId}`);
    } catch {
      // Error is set in store
    }
  }, [sessions, connectSavedHost, setActiveWorkspace, navigate]);

  const handleOpenWorkspace = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.sessionId === sessionId);
    if (!session) return;
    setActiveWorkspace(sessionId);
    const wsBase = `/workspace/${sessionId}`;
    switch (session.workspaceType) {
      case 'docker':     navigate(`${wsBase}/docker`); break;
      case 'kubernetes': navigate(`${wsBase}/k8s`);    break;
      default:           navigate(wsBase);
    }
  }, [sessions, setActiveWorkspace, navigate]);

  return (
    <ConnectionHubPage
      savedHostConfigs={savedHostConfigs}
      activeSessions={activeSessions}
      connectingConfigId={connectingHostId}
      deletingConfigId={deletingHostId}
      onConnect={handleConnect}
      onDelete={deleteSavedHost}
      onCreateNew={() => navigate('/sessions')}
      onLaunchWorkspace={handleLaunchWorkspace}
      onOpenWorkspace={handleOpenWorkspace}
      onHostUpdated={fetchSavedHosts}
    />
  );
}

export function WorkspaceRoute() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const sessions = useConnectionStore(s => s.sessions);
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  const session = useMemo(
    () => sessions.find(s => s.sessionId === sessionId),
    [sessions, sessionId],
  );

  useEffect(() => {
    if (sessionId) {
      setActiveWorkspace(sessionId);
    }
  }, [sessionId, setActiveWorkspace]);

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
        <span
          className="material-symbols-rounded"
          style={{ fontSize: '48px', color: 'var(--color-primary)' }}
        >
          error_outline
        </span>
        <div className="text-center">
          <p className="label text-secondary">Session not found</p>
          <p className="text-ui-sm text-muted mt-1">The session may have expired or been closed.</p>
          <button
            onClick={() => navigate('/infrastructure')}
            className="mt-4 px-4 py-2 rounded text-xs font-medium brand-gradient brand-gradient-hover cursor-pointer"
          >
            Back to Infrastructure
          </button>
        </div>
      </div>
    );
  }

  const uiHost = toUIHost(session);

  return (
    <KineticWorkspacePage
      session={uiHost}
      onBack={() => navigate('/infrastructure')}
      capabilitiesDetected={session.capabilitiesDetected}
    />
  );
}

export function SavedHostsRoute() {
  const savedHostConfigs = useConnectionStore(s => s.savedHosts);
  const connectingHostId = useConnectionStore(s => s.connectingHostId);
  const deletingHostId = useConnectionStore(s => s.deletingHostId);
  const connectSavedHost = useConnectionStore(s => s.connectSavedHost);
  const deleteSavedHost = useConnectionStore(s => s.deleteSavedHost);

  return (
    <SavedHostsPage
      savedHostConfigs={savedHostConfigs}
      connectingConfigId={connectingHostId}
      deletingConfigId={deletingHostId}
      onConnect={(id) => connectSavedHost(id)}
      onDelete={deleteSavedHost}
    />
  );
}

export function TransferHistoryRoute() {
  const sessions = useConnectionStore(s => s.sessions);
  const sessionIds = useMemo(() => sessions.map(s => s.sessionId), [sessions]);

  return <TransferHistoryPage sessionIds={sessionIds} />;
}

export function DockerDashboardRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <DockerDashboardPage sessionId={sessionId} />;
}

export function DockerContainersRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <DockerContainersPage sessionId={sessionId} />;
}

export function DockerImagesRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <DockerImagesPage sessionId={sessionId} />;
}

export function DockerNetworksRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <DockerNetworksPage sessionId={sessionId} />;
}

export function DockerVolumesRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <DockerVolumesPage sessionId={sessionId} />;
}

export function DockerComposeRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <DockerComposePage sessionId={sessionId} />;
}

export function K8sDashboardRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <K8sDashboardPage sessionId={sessionId} />;
}

export function K8sPodsRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <K8sPodsPage sessionId={sessionId} />;
}

export function K8sDeploymentsRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <K8sDeploymentsPage sessionId={sessionId} />;
}

export function K8sServicesRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <K8sServicesPage sessionId={sessionId} />;
}

export function K8sNodesRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <K8sNodesPage sessionId={sessionId} />;
}

export function K8sIngressesRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <K8sIngressPage sessionId={sessionId} />;
}

export function K8sStatefulSetsRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <K8sStatefulSetsPage sessionId={sessionId} />;
}

export function K8sDaemonSetsRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <K8sDaemonSetsPage sessionId={sessionId} />;
}

export function K8sConfigMapsRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <K8sConfigMapsPage sessionId={sessionId} />;
}

export function SshMonitoringRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <SshMonitoringPage sessionId={sessionId} />;
}

export function SshLogsRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <SshLogsPage sessionId={sessionId} />;
}

export function DockerMonitoringRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <DockerMonitoringPage sessionId={sessionId} />;
}

export function DockerLogsRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setActiveWorkspace = useConnectionStore(s => s.setActiveWorkspace);

  useEffect(() => {
    if (!sessionId) {
      navigate('/infrastructure');
      return;
    }
    setActiveWorkspace(sessionId);
  }, [sessionId, navigate, setActiveWorkspace]);

  if (!sessionId) return null;
  return <DockerLogsPage sessionId={sessionId} />;
}
