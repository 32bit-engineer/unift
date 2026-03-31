
import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout, ProtectedRoute, PublicOnlyRoute } from '@/components/layout';
import { AuthPage } from '@/pages';
import { lazy, Suspense } from 'react';

// Lazy-load route wrappers for code splitting
const DashboardRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.DashboardRoute })));
const SessionsRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.SessionsRoute })));
const InfrastructureRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.InfrastructureRoute })));
const WorkspaceRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.WorkspaceRoute })));
const SavedHostsRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.SavedHostsRoute })));
const TransferHistoryRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.TransferHistoryRoute })));
const TransferLogPage = lazy(() => import('@/pages/TransferLogPage').then(m => ({ default: m.TransferLogPage })));
const UploadSessionsPage = lazy(() => import('@/pages/UploadSessionsPage').then(m => ({ default: m.UploadSessionsPage })));
const DockerDashboardRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.DockerDashboardRoute })));
const DockerContainersRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.DockerContainersRoute })));
const DockerImagesRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.DockerImagesRoute })));
const DockerNetworksRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.DockerNetworksRoute })));
const DockerVolumesRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.DockerVolumesRoute })));
const DockerComposeRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.DockerComposeRoute })));
const K8sDashboardRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.K8sDashboardRoute })));
const K8sPodsRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.K8sPodsRoute })));
const K8sDeploymentsRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.K8sDeploymentsRoute })));
const K8sServicesRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.K8sServicesRoute })));
const K8sNodesRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.K8sNodesRoute })));
const K8sIngressesRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.K8sIngressesRoute })));
const K8sStatefulSetsRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.K8sStatefulSetsRoute })));
const K8sDaemonSetsRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.K8sDaemonSetsRoute })));
const K8sConfigMapsRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.K8sConfigMapsRoute })));
const SshMonitoringRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.SshMonitoringRoute })));
const SshLogsRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.SshLogsRoute })));
const DockerMonitoringRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.DockerMonitoringRoute })));
const DockerLogsRoute = lazy(() => import('@/pages/RouteWrappers').then(m => ({ default: m.DockerLogsRoute })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
        />
        <span className="text-meta text-muted">Loading...</span>
      </div>
    </div>
  );
}

export function App() {
  return (
    <div className="dark">
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes (redirect to dashboard if already authenticated) */}
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<AuthPage />} />
            </Route>

            {/* Protected routes — wrapped in AppLayout with sidebar + header */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardRoute />} />
                <Route path="sessions" element={<SessionsRoute />} />
                <Route path="infrastructure" element={<InfrastructureRoute />} />
                <Route path="workspace/:sessionId" element={<WorkspaceRoute />} />
                <Route path="workspace/:sessionId/monitoring" element={<SshMonitoringRoute />} />
                <Route path="workspace/:sessionId/logs" element={<SshLogsRoute />} />
                <Route path="workspace/:sessionId/docker" element={<DockerDashboardRoute />} />
                <Route path="workspace/:sessionId/docker/containers" element={<DockerContainersRoute />} />
                <Route path="workspace/:sessionId/docker/images" element={<DockerImagesRoute />} />
                <Route path="workspace/:sessionId/docker/networks" element={<DockerNetworksRoute />} />
                <Route path="workspace/:sessionId/docker/volumes" element={<DockerVolumesRoute />} />
                <Route path="workspace/:sessionId/docker/compose" element={<DockerComposeRoute />} />
                <Route path="workspace/:sessionId/docker/monitoring" element={<DockerMonitoringRoute />} />
                <Route path="workspace/:sessionId/docker/logs" element={<DockerLogsRoute />} />
                <Route path="workspace/:sessionId/k8s" element={<K8sDashboardRoute />} />
                <Route path="workspace/:sessionId/k8s/pods" element={<K8sPodsRoute />} />
                <Route path="workspace/:sessionId/k8s/deployments" element={<K8sDeploymentsRoute />} />
                <Route path="workspace/:sessionId/k8s/services" element={<K8sServicesRoute />} />
                <Route path="workspace/:sessionId/k8s/nodes" element={<K8sNodesRoute />} />
                <Route path="workspace/:sessionId/k8s/ingresses" element={<K8sIngressesRoute />} />
                <Route path="workspace/:sessionId/k8s/statefulsets" element={<K8sStatefulSetsRoute />} />
                <Route path="workspace/:sessionId/k8s/daemonsets" element={<K8sDaemonSetsRoute />} />
                <Route path="workspace/:sessionId/k8s/configmaps" element={<K8sConfigMapsRoute />} />
                <Route path="saved-hosts" element={<SavedHostsRoute />} />
                <Route path="transfers/active" element={<TransferHistoryRoute />} />
                <Route path="transfers/log" element={<TransferLogPage />} />
                <Route path="transfers/uploads" element={<UploadSessionsPage />} />
              </Route>
            </Route>

            {/* Catch-all — redirect to dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </div>
  );
}

export default App;
