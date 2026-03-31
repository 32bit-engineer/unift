import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useConnectionStore } from '@/store/connectionStore';
import { Sidebar } from '@/components/layout';
import { SshWorkspaceSidebar } from './SshWorkspaceSidebar';
import { DockerWorkspaceSidebar } from './DockerWorkspaceSidebar';
import { K8sWorkspaceSidebar } from './K8sWorkspaceSidebar';
import { WorkspaceDetectionModal } from './WorkspaceDetectionModal';
import type { SavedHost } from '@/components/layout';
import { TransferProgressPopup } from '@/components/ui';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { WorkspaceType } from '@/utils/remoteConnectionAPI';

/**
 * AppLayout wraps the authenticated application shell.
 * Renders the correct dedicated sidebar based on the active workspace type:
 *   - Non-workspace routes: main sidebar (Dashboard, Sessions, etc.)
 *   - SSH workspace: SshWorkspaceSidebar (Overview, Terminal, Files)
 *   - Docker workspace: DockerWorkspaceSidebar (Dashboard, Containers, Images)
 *   - K8s workspace: K8sWorkspaceSidebar (Dashboard, Pods, Deployments, Services, Nodes)
 *
 * After connecting, capabilities are detected and the user is asked which
 * dashboard they prefer. The choice is persisted to the saved host config.
 */
export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const {
    sessions,
    savedHosts: savedHostConfigs,
    connectingHostId,
    deletingHostId,
    fetchSessions,
    fetchSavedHosts,
    connectSavedHost,
    deleteSavedHost,
    setActiveWorkspace,
    setWorkspaceType,
    updateSessionCapabilities,
    markCapabilitiesDetected,
  } = useConnectionStore();

  const fetchedOnce = useRef(false);
  const [showDetectionModal, setShowDetectionModal] = useState<string | null>(null);

  useEffect(() => {
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;
    fetchSessions();
    fetchSavedHosts();
  }, [fetchSessions, fetchSavedHosts]);

  const sessionIds = useMemo(() => sessions.map(s => s.sessionId), [sessions]);

  // Detect workspace context from route
  const workspaceSessionId = useMemo(() => {
    const match = location.pathname.match(/^\/workspace\/([^/]+)/);
    return match ? match[1] : null;
  }, [location.pathname]);

  const workspaceSession = useMemo(
    () => (workspaceSessionId ? sessions.find(s => s.sessionId === workspaceSessionId) : null),
    [sessions, workspaceSessionId],
  );

  // Determine which workspace type is active from the URL
  const activeWorkspaceType: WorkspaceType | null = useMemo(() => {
    if (!workspaceSessionId) return null;
    const path = location.pathname;
    if (path.includes('/docker')) return 'docker';
    if (path.includes('/k8s')) return 'kubernetes';
    return 'ssh';
  }, [workspaceSessionId, location.pathname]);

  // Trigger capability detection when entering a workspace for the first time
  useEffect(() => {
    if (!workspaceSessionId || !workspaceSession) return;
    if (workspaceSession.capabilitiesDetected) return;

    // If the URL already points to a specific workspace type, the user reached here
    // through a prior detection choice (or via KineticWorkspacePage.DockerModal which
    // navigates directly without calling handleDetectionComplete). Trust the URL,
    // restore store state, and dismiss any stale detection modal — prevents the modal
    // from re-appearing on top of the Docker/K8s dashboard.
    if (activeWorkspaceType === 'docker') {
      updateSessionCapabilities(workspaceSessionId, { docker: true });
      markCapabilitiesDetected(workspaceSessionId);
      setWorkspaceType(workspaceSessionId, 'docker');
      if (showDetectionModal) setShowDetectionModal(null);
      return;
    }
    if (activeWorkspaceType === 'kubernetes') {
      updateSessionCapabilities(workspaceSessionId, { kubernetes: true });
      markCapabilitiesDetected(workspaceSessionId);
      setWorkspaceType(workspaceSessionId, 'kubernetes');
      if (showDetectionModal) setShowDetectionModal(null);
      return;
    }

    // For SSH workspace routes, don't re-open the modal if it is already showing.
    if (showDetectionModal) return;
    const savedHost = savedHostConfigs.find(h => h.activeSessionId === workspaceSessionId);
    if (savedHost?.workspacePreference && savedHost.workspacePreference !== 'ssh') {
      const pref = savedHost.workspacePreference;
      markCapabilitiesDetected(workspaceSessionId);
      setWorkspaceType(workspaceSessionId, pref);
      const wsBase = `/workspace/${workspaceSessionId}`;
      if (pref === 'docker') {
        navigate(`${wsBase}/docker`);
      } else if (pref === 'kubernetes') {
        navigate(`${wsBase}/k8s`);
      }
      return;
    }

    // Show detection modal for new sessions
    setShowDetectionModal(workspaceSessionId);
  }, [workspaceSessionId, workspaceSession, activeWorkspaceType, savedHostConfigs, showDetectionModal, updateSessionCapabilities, markCapabilitiesDetected, setWorkspaceType, navigate]);

  // Build available workspace types from session capabilities
  const availableTypes: WorkspaceType[] = useMemo(() => {
    if (!workspaceSession) return ['ssh'];
    const types: WorkspaceType[] = ['ssh'];
    if (workspaceSession.capabilities.docker) types.push('docker');
    if (workspaceSession.capabilities.kubernetes) types.push('kubernetes');
    return types;
  }, [workspaceSession]);

  // Derive active sidebar item from current route path
  const activeItem = useMemo(() => {
    const path = location.pathname;
    if (workspaceSessionId) {
      // Docker sidebar items
      if (path.includes('/docker/containers')) return 'ws-docker-containers';
      if (path.includes('/docker/images')) return 'ws-docker-images';
      if (path.includes('/docker/networks')) return 'ws-docker-networks';
      if (path.includes('/docker/volumes')) return 'ws-docker-volumes';
      if (path.includes('/docker/compose')) return 'ws-docker-compose';
      if (path.includes('/docker/monitoring')) return 'ws-docker-monitoring';
      if (path.includes('/docker/logs')) return 'ws-docker-logs';
      if (path.includes('/docker')) return 'ws-docker-dashboard';
      // K8s sidebar items
      if (path.includes('/k8s/pods')) return 'ws-k8s-pods';
      if (path.includes('/k8s/deployments')) return 'ws-k8s-deployments';
      if (path.includes('/k8s/services')) return 'ws-k8s-services';
      if (path.includes('/k8s/nodes')) return 'ws-k8s-nodes';
      if (path.includes('/k8s/ingresses')) return 'ws-k8s-ingresses';
      if (path.includes('/k8s/statefulsets')) return 'ws-k8s-statefulsets';
      if (path.includes('/k8s/daemonsets')) return 'ws-k8s-daemonsets';
      if (path.includes('/k8s/configmaps')) return 'ws-k8s-configmaps';
      if (path.includes('/k8s')) return 'ws-k8s-dashboard';
      // SSH sidebar items
      return 'ws-overview';
    }
    if (path.startsWith('/infrastructure')) return 'connection-hub';
    if (path.startsWith('/sessions')) return 'remote-hosts';
    if (path.startsWith('/saved-hosts')) return 'saved-hosts';
    if (path.startsWith('/transfers/active')) return 'transfer-history';
    if (path.startsWith('/transfers/log')) return 'transfer-log';
    if (path.startsWith('/transfers/uploads')) return 'upload-sessions';
    if (path === '/') return 'my-files';
    return 'my-files';
  }, [location.pathname, workspaceSessionId]);

  // Sidebar saved-host view derived from sessions.
  // Label includes the active workspace type suffix for clarity.
  const WORKSPACE_LABELS: Record<WorkspaceType, string> = {
    ssh: 'SSH Workspace',
    docker: 'Docker Workspace',
    kubernetes: 'Kubernetes Workspace',
  };

  const activeSessions: SavedHost[] = useMemo(
    () => sessions.map(s => ({
      id: s.sessionId,
      label: `${s.name} - ${WORKSPACE_LABELS[s.workspaceType] ?? 'SSH Workspace'}`,
      status: s.status,
    })),
    [sessions],
  );

  // Handle switching workspace type via the sidebar type switcher
  const handleSwitchWorkspaceType = useCallback((type: WorkspaceType) => {
    if (!workspaceSessionId) return;
    setWorkspaceType(workspaceSessionId, type);
    const wsBase = `/workspace/${workspaceSessionId}`;
    switch (type) {
      case 'docker':
        navigate(`${wsBase}/docker`);
        break;
      case 'kubernetes':
        navigate(`${wsBase}/k8s`);
        break;
      default:
        navigate(wsBase);
    }
  }, [workspaceSessionId, navigate, setWorkspaceType]);

  // Workspace nav item selection
  const handleWorkspaceNavSelect = useCallback((id: string) => {
    if (!workspaceSessionId) return;
    const wsBase = `/workspace/${workspaceSessionId}`;
    const wsRouteMap: Record<string, string> = {
      // SSH
      'ws-overview': wsBase,
      'ws-terminal': wsBase,
      'ws-files': wsBase,
      'ws-monitoring': `${wsBase}/monitoring`,
      'ws-logs': `${wsBase}/logs`,
      // Docker
      'ws-docker-dashboard': `${wsBase}/docker`,
      'ws-docker-containers': `${wsBase}/docker/containers`,
      'ws-docker-images': `${wsBase}/docker/images`,
      'ws-docker-networks': `${wsBase}/docker/networks`,
      'ws-docker-volumes': `${wsBase}/docker/volumes`,
      'ws-docker-compose': `${wsBase}/docker/compose`,
      'ws-docker-monitoring': `${wsBase}/docker/monitoring`,
      'ws-docker-logs': `${wsBase}/docker/logs`,
      // K8s
      'ws-k8s-dashboard': `${wsBase}/k8s`,
      'ws-k8s-pods': `${wsBase}/k8s/pods`,
      'ws-k8s-deployments': `${wsBase}/k8s/deployments`,
      'ws-k8s-services': `${wsBase}/k8s/services`,
      'ws-k8s-nodes': `${wsBase}/k8s/nodes`,
      'ws-k8s-ingresses': `${wsBase}/k8s/ingresses`,
      'ws-k8s-statefulsets': `${wsBase}/k8s/statefulsets`,
      'ws-k8s-daemonsets': `${wsBase}/k8s/daemonsets`,
      'ws-k8s-configmaps': `${wsBase}/k8s/configmaps`,
    };
    navigate(wsRouteMap[id] ?? wsBase);
  }, [workspaceSessionId, navigate]);

  const handleMainNavSelect = (id: string) => {
    // Active session clicked — navigate to its workspace
    if (id.startsWith('host:')) {
      const sessionId = id.replace('host:', '');
      const session = sessions.find(s => s.sessionId === sessionId);
      if (session) {
        setActiveWorkspace(sessionId);
        const wsBase = `/workspace/${sessionId}`;
        switch (session.workspaceType) {
          case 'docker':
            navigate(`${wsBase}/docker`);
            break;
          case 'kubernetes':
            navigate(`${wsBase}/k8s`);
            break;
          default:
            navigate(wsBase);
        }
      }
      return;
    }

    // Workspace nav items — delegate to workspace handler
    if (workspaceSessionId && id.startsWith('ws-')) {
      handleWorkspaceNavSelect(id);
      return;
    }

    const routeMap: Record<string, string> = {
      'my-files': '/',
      'remote-hosts': '/sessions',
      'connection-hub': '/infrastructure',
      'transfer-history': '/transfers/active',
      'transfer-log': '/transfers/log',
      'upload-sessions': '/transfers/uploads',
      'saved-hosts': '/saved-hosts',
      'recent': '/recent',
      'starred': '/starred',
      'shared': '/shared',
      'trash': '/trash',
    };
    navigate(routeMap[id] ?? '/');
  };

  const handleConnectConfig = async (id: string) => {
    try {
      const session = await connectSavedHost(id);
      setActiveWorkspace(session.sessionId);
      // Navigate to workspace — the useEffect will handle detection/preference
      navigate(`/workspace/${session.sessionId}`);
    } catch {
      // Error is set in store
    }
  };

  // Handle detection modal completion
  const handleDetectionComplete = useCallback((chosen: WorkspaceType, capabilities: { docker: boolean; kubernetes: boolean }, selectedTypes?: WorkspaceType[]) => {
    const sid = showDetectionModal;
    if (!sid) return;
    setShowDetectionModal(null);

    // Update session capabilities and mark as detected
    updateSessionCapabilities(sid, {
      docker: capabilities.docker,
      kubernetes: capabilities.kubernetes,
    });
    markCapabilitiesDetected(sid);

    // Update session workspace type
    setWorkspaceType(sid, chosen);

    // Activate all selected workspace types on the backend
    const types = selectedTypes ?? [chosen];
    for (const type of types) {
      if (type !== 'ssh') {
        remoteConnectionAPI.activateWorkspace(sid, type).catch(() => {
          // Best effort — non-blocking
        });
      }
    }

    // Persist preference to saved host if connected via one
    const savedHost = savedHostConfigs.find(h => h.activeSessionId === sid);
    if (savedHost) {
      remoteConnectionAPI.updateWorkspacePreference(savedHost.id, chosen).catch(() => {
        // Best effort — non-blocking
      });
    }

    // Navigate to the chosen workspace
    const wsBase = `/workspace/${sid}`;
    switch (chosen) {
      case 'docker':
        navigate(`${wsBase}/docker`);
        break;
      case 'kubernetes':
        navigate(`${wsBase}/k8s`);
        break;
      default:
        navigate(wsBase);
    }
  }, [showDetectionModal, updateSessionCapabilities, markCapabilitiesDetected, setWorkspaceType, savedHostConfigs, navigate]);

  const handleDetectionSkip = useCallback(() => {
    const sid = showDetectionModal;
    setShowDetectionModal(null);
    if (sid) {
      markCapabilitiesDetected(sid);
      navigate(`/workspace/${sid}`);
    }
  }, [showDetectionModal, markCapabilitiesDetected, navigate]);

  const handleDeleteConfig = async (id: string) => {
    await deleteSavedHost(id);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleBackToInfrastructure = useCallback(() => {
    navigate('/infrastructure');
  }, [navigate]);

  // Breadcrumb mapping for the header
  const breadcrumbMap: Record<string, { parts: string[]; }> = {
    '/': { parts: ['Home', 'Dashboard'] },
    '/sessions': { parts: ['Home', 'Sessions'] },
    '/infrastructure': { parts: ['Home', 'Infrastructure'] },
    '/saved-hosts': { parts: ['Home', 'Saved Hosts'] },
    '/transfers/active': { parts: ['Home', 'Transfers', 'Active'] },
    '/transfers/log': { parts: ['Home', 'Transfers', 'Log'] },
    '/transfers/uploads': { parts: ['Home', 'Transfers', 'Uploads'] },
  };

  const crumb = useMemo(() => {
    if (workspaceSession) {
      const name = workspaceSession.name;
      if (activeWorkspaceType === 'docker') {
        return { parts: ['Home', name, 'Docker'] };
      }
      if (activeWorkspaceType === 'kubernetes') {
        return { parts: ['Home', name, 'Kubernetes'] };
      }
      return { parts: ['Home', name, 'SSH'] };
    }
    return breadcrumbMap[location.pathname] ?? { parts: ['Home'] };
  }, [workspaceSession, activeWorkspaceType, location.pathname]);

  // Render the appropriate sidebar based on workspace context
  const renderSidebar = () => {
    if (!workspaceSessionId || !workspaceSession) {
      return (
        <Sidebar
          activeItem={activeItem}
          onSelectItem={handleMainNavSelect}
          savedHosts={activeSessions}
          savedHostConfigs={savedHostConfigs}
          activeSessions={activeSessions}
          connectingConfigId={connectingHostId}
          deletingConfigId={deletingHostId}
          onConnectConfig={handleConnectConfig}
          onDeleteConfig={handleDeleteConfig}
          onShowAllSavedHosts={() => navigate('/saved-hosts')}
          workspaceSessionName={null}
          workspaceCapabilities={null}
        />
      );
    }

    const sessionName = workspaceSession.name;
    const commonProps = {
      sessionName,
      activeItem,
      onBack: handleBackToInfrastructure,
      availableTypes,
      onSwitchType: handleSwitchWorkspaceType,
    };

    switch (activeWorkspaceType) {
      case 'docker':
        return (
          <DockerWorkspaceSidebar
            {...commonProps}
            onSelectItem={handleWorkspaceNavSelect}
          />
        );
      case 'kubernetes':
        return (
          <K8sWorkspaceSidebar
            {...commonProps}
            onSelectItem={handleWorkspaceNavSelect}
          />
        );
      default:
        return (
          <SshWorkspaceSidebar
            {...commonProps}
            onSelectItem={handleWorkspaceNavSelect}
          />
        );
    }
  };

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--color-bg-base)' }}>
      {renderSidebar()}

      <div className="flex flex-col flex-1 overflow-hidden">
        <header
          className="h-14 shrink-0 flex items-center justify-between px-6 gap-4"
          style={{
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border-muted)',
          }}
        >
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

          <div className="flex items-center gap-3">
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
            <button className="p-1.5 hover:bg-white/5 rounded transition-colors relative cursor-pointer">
              <span className="material-symbols-rounded text-slate-400" style={{ fontSize: '20px' }}>
                notifications
              </span>
              <span
                className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--color-primary)' }}
              />
            </button>
            <span className="w-px h-5 bg-[#1E1E2E]" />
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-status-ok)' }} />
              <span className="text-meta text-secondary">
                {user?.username ?? 'user'}
              </span>
            </div>
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

        <main
          className="flex-1 overflow-auto custom-scrollbar h-0"
          style={{ background: 'var(--color-bg-base)' }}
        >
          <Outlet />
        </main>
      </div>

      <TransferProgressPopup
        sessionIds={sessionIds}
        onViewAll={() => navigate('/transfers/active')}
      />

      {/* Workspace detection modal — shown when connecting to a new host */}
      {showDetectionModal && (
        <WorkspaceDetectionModal
          sessionId={showDetectionModal}
          onComplete={handleDetectionComplete}
          onSkip={handleDetectionSkip}
        />
      )}
    </div>
  );
}
