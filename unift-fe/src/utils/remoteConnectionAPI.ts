import { apiClient, tokenStorage } from '@/utils/apiClient';
import { API_BASE_URL } from '@/config/api.config';


export type ProtocolType = 'SSH_SFTP' | 'FTP' | 'SMB';

export type SshAuthType = 'PASSWORD' | 'PRIVATE_KEY' | 'PRIVATE_KEY_PASSPHRASE';

export interface ConnectRequest {
  protocol: ProtocolType;
  /** Optional friendly label stored with the session, e.g. "Production Server". */
  label?: string;
  host: string;
  port: number;
  username: string;
  sshAuthType?: SshAuthType;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  sessionTtlMinutes?: number;
  strictHostKeyChecking?: boolean;
  expectedFingerprint?: string;
}

export type SessionStateType = 'INITIALIZING' | 'ACTIVE' | 'CLOSED' | 'EXPIRED' | 'ERROR';

export interface SessionState {
  sessionId: string;
  /** Friendly alias provided at connect-time. */
  label?: string;
  protocol: ProtocolType;
  host: string;
  port: number;
  username: string;
  state: SessionStateType;
  createdAt: string;
  expiresAt: string;
  homeDirectory?: string;
  /** Detected OS name, e.g. "Ubuntu 22.04.3 LTS". null if detection failed. */
  remoteOs?: string;
}

export interface DirectoryListingResponse {
  path: string;
  totalEntries: number;
  entries: Array<{
    name: string;
    type: 'FILE' | 'DIRECTORY' | 'SYMLINK';
    path: string;
    hidden: boolean;
    sizeBytes?: number;
    lastModified?: string;
    permissions?: string;
  }>;
}

export interface RenameRequest {
  remotePath: string;
  newPath: string;
}

export type TransferState = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface TransferStatusResponse {
  transferId: string;
  sessionId: string;
  remotePath: string;
  direction: 'UPLOAD' | 'DOWNLOAD';
  state: TransferState;
  bytesTransferred: number;
  totalBytes: number;
  progressPercent: number;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  protocol: string;
  host: string;
  port: number;
}

export interface SavedHostRequest {
  label?: string;
  protocol: ProtocolType;
  hostname: string;
  port: number;
  username: string;
  authType?: SshAuthType;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  strictHostKeyChecking?: boolean;
  expectedFingerprint?: string;
}

export interface SavedHostResponse {
  id: string;
  label?: string;
  protocol: ProtocolType;
  hostname: string;
  port: number;
  username: string;
  authType?: SshAuthType;
  strictHostKeyChecking: boolean;
  expectedFingerprint?: string;
  createdAt: string;
  lastUsed?: string;
  workspacePreference?: WorkspaceType;
  activeSessionId?: string;
  activeSessionInitiatedBy?: string;
}

export type WorkspaceType = 'ssh' | 'docker' | 'kubernetes';

/** Response from connecting to a saved host — same shape as SessionState. */
export type ConnectFromSavedResponse = SessionState;

export interface TrafficDataPoint {
  timestamp: string;
  uploadBytesPerSec: number;
  downloadBytesPerSec: number;
}

export interface SessionAnalyticsResponse {
  sessionId: string;
  host: string;
  username: string;
  state: string;
  sessionDurationFormatted: string;
  sessionDurationSeconds: number;
  generatedAt: string;
  latency: {
    avgMs: number;
    minMs: number | null;
    maxMs: number | null;
    samplesCount: number;
    unavailable: boolean;
  };
  packetLoss: {
    lossPercent: number;
    packetsReceived: number;
    packetsSent: number;
    unavailable: boolean;
  };
  throughput: {
    currentDownloadBytesPerSec: number;
    currentUploadBytesPerSec: number;
    totalDownloadedBytes: number;
    totalUploadedBytes: number;
    history: TrafficDataPoint[];
  };
  trafficAnalysis: TrafficDataPoint[];
  systemMetrics: {
    cpuPercent: number | null;
    memoryUsedPercent: number | null;
    memoryUsedBytes: number | null;
    memoryTotalBytes: number | null;
    diskUsedPercent: number | null;
    diskUsedBytes: number | null;
    diskTotalBytes: number | null;
    unavailable: boolean;
  };
  metadata: {
    processPid: number | null;
    sshCipher?: string;
    encryption?: string;
    tunnelMode?: string;
    region?: string;
    remoteOs?: string;
    lastHeartbeat?: string;
    port: number;
  };
  connectedNodes: Array<{
    sessionId: string;
    host: string;
    port: number;
    username: string;
    label?: string;
    state: string;
    cpuPercent: number | null;
    remoteOs?: string;
    createdAt: string;
  }>;
}

/** Paginated list of historical analytics snapshots for one session. */
export interface AnalyticsHistoryResponse {
  sessionId: string;
  count: number;
  hasMore: boolean;
  snapshots: SessionAnalyticsResponse[];
}

/** Persistent audit record for a completed, failed, or cancelled file transfer. */
export interface TransferLogResponse {
  id: string;
  filename: string;
  source: string;
  destination: string;
  sizeBytes?: number;
  avgSpeedBps?: number;
  durationMs?: number;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  errorMessage?: string;
  createdAt: string;
}

/** Aggregate statistics from the user's transfer history. */
export interface TransferHistoryStatsResponse {
  totalTransfers: number;
  completedTransfers: number;
  failedTransfers: number;
  cancelledTransfers: number;
  totalBytesTransferred?: number;
  avgSpeedBps?: number;
}

export type UploadSessionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export interface UploadSessionRequest {
  filename: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  destinationPath: string;
}

/** Snapshot of a resumable chunked-upload session. */
export interface UploadSessionResponse {
  id: string;
  filename: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  destinationPath: string;
  status: UploadSessionStatus;
  progressPercent: number;
  createdAt: string;
  expiresAt: string;
}

// Docker types — mirrors DockerModels.java DTOs
export interface DockerInfo {
  available: boolean;
  version: string;
  totalContainers: number;
  runningContainers: number;
  stoppedContainers: number;
  pausedContainers: number;
  totalImages: number;
  serverOs: string;
  storageDriver: string;
}

export interface DockerContainer {
  id: string;
  names: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  createdAt: string;
  size: string;
  networks: string;
}

export interface DockerContainerStats {
  containerId: string;
  name: string;
  cpuPercent: string;
  memoryUsage: string;
  memoryLimit: string;
  memoryPercent: string;
  networkIo: string;
  blockIo: string;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  createdAt: string;
  createdSince: string;
}

export interface DockerOverview {
  info: DockerInfo;
  runningContainers: DockerContainer[];
  stats: DockerContainerStats[];
}

export interface ContainerActionResult {
  containerId: string;
  action: string;
  success: boolean;
  message: string;
}

export interface ContainerPage {
  containers: DockerContainer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImagePage {
  images: DockerImage[];
  total: number;
}

// -- Kubernetes types --

export interface K8sClusterInfo {
  available: boolean;
  serverVersion: string;
  platform: string;
  clusterName: string;
}

export interface K8sContainerStatus {
  name: string;
  image: string;
  ready: boolean;
  restartCount: number;
  state: string;
}

export interface K8sPod {
  name: string;
  namespace: string;
  status: string;
  nodeName: string;
  restarts: number;
  age: string;
  ip: string;
  labels: Record<string, string>;
  containers: K8sContainerStatus[];
}

export interface K8sDeployment {
  name: string;
  namespace: string;
  replicas: number;
  readyReplicas: number;
  updatedReplicas: number;
  availableReplicas: number;
  age: string;
  strategy: string;
  labels: Record<string, string>;
}

export interface K8sServiceResource {
  name: string;
  namespace: string;
  type: string;
  clusterIp: string;
  externalIp: string;
  ports: string;
  age: string;
  selector: Record<string, string>;
}

export interface K8sNode {
  name: string;
  status: string;
  roles: string;
  version: string;
  internalIp: string;
  osImage: string;
  architecture: string;
  cpuCapacity: string;
  memoryCapacity: string;
}

export interface K8sNamespace {
  name: string;
  status: string;
  age: string;
}

export interface K8sOverview {
  clusterInfo: K8sClusterInfo;
  totalPods: number;
  runningPods: number;
  pendingPods: number;
  failedPods: number;
  totalDeployments: number;
  totalServices: number;
  totalNodes: number;
  readyNodes: number;
  namespaces: K8sNamespace[];
  recentPods: K8sPod[];
}

export interface PodPage {
  pods: K8sPod[];
  total: number;
}

export interface DeploymentPage {
  deployments: K8sDeployment[];
  total: number;
}

export interface K8sServicePage {
  services: K8sServiceResource[];
  total: number;
}

export interface NodePage {
  nodes: K8sNode[];
  total: number;
}

export interface PodActionResult {
  podName: string;
  namespace: string;
  action: string;
  success: boolean;
  message: string;
}

/** Live YAML for a Kubernetes resource (status + managedFields stripped by the server). */
export interface ResourceYaml {
  kind: string;
  namespace: string;
  name: string;
  yaml: string;
}

// -- Additional Kubernetes resource types --

export interface K8sConfigMap {
  name: string;
  namespace: string;
  age: string;
  dataCount: number;
  dataKeys: string[];
}

export interface ConfigMapPage {
  configMaps: K8sConfigMap[];
  total: number;
}

export interface K8sIngressPath {
  path: string;
  pathType: string;
  serviceName: string;
  servicePort: string;
}

export interface K8sIngressHostRule {
  host: string;
  paths: K8sIngressPath[];
}

export interface K8sIngress {
  name: string;
  namespace: string;
  age: string;
  className: string;
  tls: boolean;
  tlsHosts: string[];
  rules: K8sIngressHostRule[];
}

export interface IngressPage {
  ingresses: K8sIngress[];
  total: number;
}

export interface K8sDaemonSet {
  name: string;
  namespace: string;
  age: string;
  desired: number;
  current: number;
  ready: number;
  upToDate: number;
  available: number;
  labels: Record<string, string>;
}

export interface DaemonSetPage {
  daemonSets: K8sDaemonSet[];
  total: number;
}

export interface K8sStatefulSet {
  name: string;
  namespace: string;
  age: string;
  replicas: number;
  readyReplicas: number;
  serviceName: string;
  labels: Record<string, string>;
}

export interface StatefulSetPage {
  statefulSets: K8sStatefulSet[];
  total: number;
}

const BASE = '/api/remote';
const HOSTS_BASE = '/api/hosts';
const STREAM_BASE = '/api/stream';
const TRANSFER_HISTORY_BASE = '/api/transfers/history';
const UPLOADS_BASE = '/api/uploads/sessions';

export const remoteConnectionAPI = {
  connect: (request: ConnectRequest) =>
    apiClient.post<SessionState>(`${BASE}/sessions`, request),

  listSessions: () =>
    apiClient.get<SessionState[]>(`${BASE}/sessions`),

  getSession: (sessionId: string) =>
    apiClient.get<SessionState>(`${BASE}/sessions/${sessionId}`),

  closeSession: (sessionId: string) =>
    apiClient.delete<void>(`${BASE}/sessions/${sessionId}`),

  listDirectory: (sessionId: string, path?: string) => {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return apiClient.get<DirectoryListingResponse>(`${BASE}/sessions/${sessionId}/files${query}`);
  },

  deleteFile: (sessionId: string, path: string) =>
    apiClient.delete<void>(`${BASE}/sessions/${sessionId}/files?path=${encodeURIComponent(path)}`),

  renameFile: (sessionId: string, remotePath: string, newPath: string) =>
    apiClient.patch<void>(`${BASE}/sessions/${sessionId}/files/rename`, { remotePath, newPath } satisfies RenameRequest),

  createDirectory: (sessionId: string, path: string) =>
    apiClient.post<string>(`${BASE}/sessions/${sessionId}/directories?path=${encodeURIComponent(path)}`),

  /**
   * Downloads a file by triggering a streamed fetch with the Bearer token
   * and piping the response into a temporary <a> element.
   */
  downloadFile: async (sessionId: string, remotePath: string, filename: string): Promise<void> => {
    const token = tokenStorage.getAccess();
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/files/download?path=${encodeURIComponent(remotePath)}`;
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  },

  /**
   * Uploads a File/Blob to the given remote path via raw octet-stream.
   * Returns the server-assigned transferId.
   * Pass an AbortSignal to support mid-stream cancellation.
   */
  uploadFile: async (sessionId: string, remotePath: string, file: File, signal?: AbortSignal): Promise<string> => {
    const token = tokenStorage.getAccess();
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/files/upload/stream?path=${encodeURIComponent(remotePath)}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(file.size),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: file,
      signal,
    });
    if (!response.ok) {
      let message = `Upload failed: ${response.status}`;
      try {
        const body = (await response.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch { /* ignore parse errors */ }
      throw new Error(message);
    }
    return response.text();
  },

  getTransfers: (sessionId: string) =>
    apiClient.get<TransferStatusResponse[]>(`${BASE}/sessions/${sessionId}/transfers`),

  getTransfer: (sessionId: string, transferId: string) =>
    apiClient.get<TransferStatusResponse>(`${BASE}/sessions/${sessionId}/transfers/${transferId}`),

  cancelTransfer: async (sessionId: string, transferId: string): Promise<void> => {
    const token = tokenStorage.getAccess();
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/transfers/${transferId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    // 409 is the expected success response (cancellation signal accepted)
    if (!response.ok && response.status !== 409) {
      throw new Error(`Cancel failed: ${response.status}`);
    }
  },

  /**
   * Reads a remote text file and returns its content as a string.
   * Uses the dedicated /flux endpoint — Flux<DataBuffer> streaming on the server,
   * chunk-by-chunk, no async dispatch, no full in-memory buffer.
   */
  readFile: async (sessionId: string, remotePath: string): Promise<string> => {
    const token = tokenStorage.getAccess();
    const url = `${API_BASE_URL}${STREAM_BASE}/sessions/${sessionId}/files?path=${encodeURIComponent(remotePath)}`;
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error(`Read failed: ${response.status}`);
    return response.text();
  },

  /**
   * Writes content back to a remote file by uploading it as a Blob.
   */
  writeFile: async (sessionId: string, remotePath: string, content: string): Promise<void> => {
    const filename = remotePath.split('/').pop() ?? 'file';
    const file = new File([content], filename, { type: 'text/plain' });
    await remoteConnectionAPI.uploadFile(sessionId, remotePath, file);
  },

  /**
   * Tests connection credentials without creating a session.
   * Returns success status and message.
   */
  testConnection: (request: ConnectRequest) =>
    apiClient.post<TestConnectionResponse>(`${BASE}/test-connection`, request),


  /**
   * Saves a host configuration with AES-256-GCM encrypted credentials.
   * Credentials are never returned in any response.
   */
  saveSavedHost: (request: SavedHostRequest) =>
    apiClient.post<SavedHostResponse>(HOSTS_BASE, request),

  /** Returns all saved host configurations for the current user. */
  listSavedHosts: () =>
    apiClient.get<SavedHostResponse[]>(HOSTS_BASE),

  /** Returns a single saved host by ID. */
  getSavedHost: (id: string) =>
    apiClient.get<SavedHostResponse>(`${HOSTS_BASE}/${id}`),

  /** Permanently removes a saved host configuration. */
  deleteSavedHost: (id: string) =>
    apiClient.delete<void>(`${HOSTS_BASE}/${id}`),

  /**
   * Opens a new SSH session using the stored (decrypted on-the-fly) credentials.
   * Plaintext credentials exist only for the duration of the TCP handshake.
   */
  connectSavedHost: (id: string) =>
    apiClient.post<ConnectFromSavedResponse>(`${HOSTS_BASE}/${id}/connect`),

  /**
   * Updates the workspace preference for a saved host.
   * Valid values: 'ssh', 'docker', 'kubernetes'.
   */
  updateWorkspacePreference: (id: string, preference: WorkspaceType) =>
    apiClient.patch<void>(`${HOSTS_BASE}/${id}/workspace-preference`, { preference }),

  /**
   * Returns a live analytics snapshot for a session.
   * Endpoint: GET /sessions/{sessionId}/analytics
   */
  getSessionAnalytics: (sessionId: string) =>
    apiClient.get<SessionAnalyticsResponse>(`${BASE}/sessions/${sessionId}/analytics`),

  /**
   * Returns historical analytics snapshots for a session (newest-first).
   * Endpoint: GET /sessions/{sessionId}/analytics/history
   */
  getSessionAnalyticsHistory: (
    sessionId: string,
    params?: { from?: string; to?: string; limit?: number },
  ) => {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.limit != null) query.set('limit', String(params.limit));
    const qs = query.toString();
    return apiClient.get<AnalyticsHistoryResponse>(
      `${BASE}/sessions/${sessionId}/analytics/history${qs ? `?${qs}` : ''}`,
    );
  },

  // Transfer History API

  /** Paginated transfer history for the authenticated user (newest first). */
  listTransferHistory: (page = 0, size = 20) =>
    apiClient.get<TransferLogResponse[]>(
      `${TRANSFER_HISTORY_BASE}?page=${page}&size=${size}`,
    ),

  /** Aggregate transfer statistics for the authenticated user. */
  getTransferHistoryStats: () =>
    apiClient.get<TransferHistoryStatsResponse>(`${TRANSFER_HISTORY_BASE}/stats`),

  /** Returns a single transfer log entry by ID. */
  getTransferHistoryEntry: (id: string) =>
    apiClient.get<TransferLogResponse>(`${TRANSFER_HISTORY_BASE}/${id}`),

  /** Permanently removes a transfer log entry. */
  deleteTransferHistoryEntry: (id: string) =>
    apiClient.delete<void>(`${TRANSFER_HISTORY_BASE}/${id}`),

  // Upload Sessions API

  /** Creates a new resumable chunked-upload session. */
  createUploadSession: (request: UploadSessionRequest) =>
    apiClient.post<UploadSessionResponse>(UPLOADS_BASE, request),

  /** Lists all upload sessions for the authenticated user; optionally filter by status. */
  listUploadSessions: (status?: UploadSessionStatus) => {
    const qs = status ? `?status=${status}` : '';
    return apiClient.get<UploadSessionResponse[]>(`${UPLOADS_BASE}${qs}`);
  },

  /** Returns the current snapshot of an upload session. */
  getUploadSession: (sessionId: string) =>
    apiClient.get<UploadSessionResponse>(`${UPLOADS_BASE}/${sessionId}`),

  /**
   * Acknowledges receipt of a chunk (0-based index).
   * When all chunks are acknowledged the session status transitions to COMPLETED.
   */
  acknowledgeChunk: (sessionId: string, chunkIndex: number) =>
    apiClient.post<UploadSessionResponse>(`${UPLOADS_BASE}/${sessionId}/chunks/${chunkIndex}`),

  /** Aborts and removes an upload session. */
  abortUploadSession: (sessionId: string) =>
    apiClient.delete<void>(`${UPLOADS_BASE}/${sessionId}`),

  // Docker API

  /** Checks if Docker is available on the remote host. */
  checkDockerAvailable: (sessionId: string) =>
    apiClient.get<{ available: boolean }>(`${BASE}/sessions/${sessionId}/docker/status`),

  /** Returns Docker daemon info (version, container/image counts, OS). */
  getDockerInfo: (sessionId: string) =>
    apiClient.get<DockerInfo>(`${BASE}/sessions/${sessionId}/docker/info`),

  /** Returns Docker overview: info + running containers + live stats. */
  getDockerOverview: (sessionId: string) =>
    apiClient.get<DockerOverview>(`${BASE}/sessions/${sessionId}/docker/overview`),

  /** Lists Docker containers with optional pagination. */
  listDockerContainers: (sessionId: string, all = true, page = 0, pageSize = 20) =>
    apiClient.get<ContainerPage>(
      `${BASE}/sessions/${sessionId}/docker/containers?all=${all}&page=${page}&pageSize=${pageSize}`,
    ),

  /** Returns live stats for all running containers. */
  getDockerContainerStats: (sessionId: string) =>
    apiClient.get<DockerContainerStats[]>(`${BASE}/sessions/${sessionId}/docker/containers/stats`),

  /** Starts a stopped container. */
  startDockerContainer: (sessionId: string, containerId: string) =>
    apiClient.post<ContainerActionResult>(`${BASE}/sessions/${sessionId}/docker/containers/${containerId}/start`),

  /** Stops a running container. */
  stopDockerContainer: (sessionId: string, containerId: string) =>
    apiClient.post<ContainerActionResult>(`${BASE}/sessions/${sessionId}/docker/containers/${containerId}/stop`),

  /** Restarts a container. */
  restartDockerContainer: (sessionId: string, containerId: string) =>
    apiClient.post<ContainerActionResult>(`${BASE}/sessions/${sessionId}/docker/containers/${containerId}/restart`),

  /** Removes a stopped container. */
  removeDockerContainer: (sessionId: string, containerId: string) =>
    apiClient.delete<ContainerActionResult>(`${BASE}/sessions/${sessionId}/docker/containers/${containerId}`),

  /** Returns tail logs for a container. */
  getDockerContainerLogs: (sessionId: string, containerId: string, tail = 200) =>
    apiClient.get<{ logs: string }>(`${BASE}/sessions/${sessionId}/docker/containers/${containerId}/logs?tail=${tail}`),

  /** Lists all Docker images on the remote host. */
  listDockerImages: (sessionId: string) =>
    apiClient.get<ImagePage>(`${BASE}/sessions/${sessionId}/docker/images`),

  /** Removes a Docker image from the remote host. */
  removeDockerImage: (sessionId: string, imageId: string) =>
    apiClient.delete<ContainerActionResult>(`${BASE}/sessions/${sessionId}/docker/images/${imageId}`),

  // -- Kubernetes --

  /** Checks whether kubectl is available on the remote host. */
  checkKubectlAvailable: (sessionId: string) =>
    apiClient.get<{ available: boolean }>(`${BASE}/sessions/${sessionId}/k8s/status`),

  /** Retrieves Kubernetes cluster info (version, platform, cluster name). */
  getK8sClusterInfo: (sessionId: string) =>
    apiClient.get<K8sClusterInfo>(`${BASE}/sessions/${sessionId}/k8s/info`),

  /** Fetches the K8s cluster overview (counts, namespaces, recent pods). */
  getK8sOverview: (sessionId: string, namespace = '') =>
    apiClient.get<K8sOverview>(`${BASE}/sessions/${sessionId}/k8s/overview?namespace=${encodeURIComponent(namespace)}`),

  /** Lists all Kubernetes namespaces. */
  listK8sNamespaces: (sessionId: string) =>
    apiClient.get<K8sNamespace[]>(`${BASE}/sessions/${sessionId}/k8s/namespaces`),

  /** Lists pods, optionally filtered by namespace. */
  listK8sPods: (sessionId: string, namespace = '') =>
    apiClient.get<PodPage>(`${BASE}/sessions/${sessionId}/k8s/pods?namespace=${encodeURIComponent(namespace)}`),

  /** Fetches tail logs for a specific pod. */
  getK8sPodLogs: (sessionId: string, podName: string, namespace = 'default', tail = 200) =>
    apiClient.get<{ logs: string }>(`${BASE}/sessions/${sessionId}/k8s/pods/${encodeURIComponent(podName)}/logs?namespace=${encodeURIComponent(namespace)}&tail=${tail}`),

  /** Deletes a pod (triggers re-creation by its controller). */
  deleteK8sPod: (sessionId: string, podName: string, namespace = 'default') =>
    apiClient.delete<PodActionResult>(`${BASE}/sessions/${sessionId}/k8s/pods/${encodeURIComponent(podName)}?namespace=${encodeURIComponent(namespace)}`),

  /** Lists deployments, optionally filtered by namespace. */
  listK8sDeployments: (sessionId: string, namespace = '') =>
    apiClient.get<DeploymentPage>(`${BASE}/sessions/${sessionId}/k8s/deployments?namespace=${encodeURIComponent(namespace)}`),

  /** Scales a deployment to the specified number of replicas. */
  scaleK8sDeployment: (sessionId: string, deploymentName: string, replicas: number, namespace = 'default') =>
    apiClient.post<PodActionResult>(`${BASE}/sessions/${sessionId}/k8s/deployments/${encodeURIComponent(deploymentName)}/scale?namespace=${encodeURIComponent(namespace)}&replicas=${replicas}`, {}),

  /** Restarts a deployment via rollout restart. */
  restartK8sDeployment: (sessionId: string, deploymentName: string, namespace = 'default') =>
    apiClient.post<PodActionResult>(`${BASE}/sessions/${sessionId}/k8s/deployments/${encodeURIComponent(deploymentName)}/restart?namespace=${encodeURIComponent(namespace)}`, {}),

  /** Lists services, optionally filtered by namespace. */
  listK8sServices: (sessionId: string, namespace = '') =>
    apiClient.get<K8sServicePage>(`${BASE}/sessions/${sessionId}/k8s/services?namespace=${encodeURIComponent(namespace)}`),

  /** Lists all nodes in the cluster. */
  listK8sNodes: (sessionId: string) =>
    apiClient.get<NodePage>(`${BASE}/sessions/${sessionId}/k8s/nodes`),

  /** Lists ConfigMaps, optionally filtered by namespace. */
  listK8sConfigMaps: (sessionId: string, namespace = '') =>
    apiClient.get<ConfigMapPage>(`${BASE}/sessions/${sessionId}/k8s/configmaps?namespace=${encodeURIComponent(namespace)}`),

  /** Lists Ingresses (networking.k8s.io/v1), optionally filtered by namespace. */
  listK8sIngresses: (sessionId: string, namespace = '') =>
    apiClient.get<IngressPage>(`${BASE}/sessions/${sessionId}/k8s/ingresses?namespace=${encodeURIComponent(namespace)}`),

  /** Lists DaemonSets, optionally filtered by namespace. */
  listK8sDaemonSets: (sessionId: string, namespace = '') =>
    apiClient.get<DaemonSetPage>(`${BASE}/sessions/${sessionId}/k8s/daemonsets?namespace=${encodeURIComponent(namespace)}`),

  /** Lists StatefulSets, optionally filtered by namespace. */
  listK8sStatefulSets: (sessionId: string, namespace = '') =>
    apiClient.get<StatefulSetPage>(`${BASE}/sessions/${sessionId}/k8s/statefulsets?namespace=${encodeURIComponent(namespace)}`),

  /** Restarts a DaemonSet via pod-template annotation patch. */
  restartK8sDaemonSet: (sessionId: string, name: string, namespace = 'default') =>
    apiClient.post<PodActionResult>(`${BASE}/sessions/${sessionId}/k8s/daemonsets/${encodeURIComponent(name)}/restart?namespace=${encodeURIComponent(namespace)}`, {}),

  /** Restarts a StatefulSet via rollout restart. */
  restartK8sStatefulSet: (sessionId: string, name: string, namespace = 'default') =>
    apiClient.post<PodActionResult>(`${BASE}/sessions/${sessionId}/k8s/statefulsets/${encodeURIComponent(name)}/restart?namespace=${encodeURIComponent(namespace)}`, {}),

  /** Scales a StatefulSet to the specified number of replicas. */
  scaleK8sStatefulSet: (sessionId: string, name: string, replicas: number, namespace = 'default') =>
    apiClient.post<PodActionResult>(`${BASE}/sessions/${sessionId}/k8s/statefulsets/${encodeURIComponent(name)}/scale?namespace=${encodeURIComponent(namespace)}&replicas=${replicas}`, {}),

  /**
   * Streams pod logs in follow mode via SSE.
   * Uses raw fetch with Authorization header (EventSource doesn’t support headers).
   * Returns a stop function — call it to abort the stream.
   */
  streamK8sPodLogs: async (
    sessionId: string,
    podName: string,
    namespace = 'default',
    tail = 100,
    onLine: (line: string) => void,
    onComplete: () => void,
    onError: (err: string) => void,
  ): Promise<() => void> => {
    const { API_BASE_URL } = await import('@/config/api.config');
    const token = tokenStorage.getAccess();
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/k8s/pods/${encodeURIComponent(podName)}/logs/stream?namespace=${encodeURIComponent(namespace)}&tail=${tail}`;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(url, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) { onError(`HTTP ${res.status}`); return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) { onComplete(); break; }
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            // SSE data lines: "data: <content>"
            if (part.startsWith('data:')) onLine(part.slice(5).trimStart());
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        onError(err instanceof Error ? err.message : 'Stream failed');
      }
    })();
    return () => controller.abort();
  },

  /** Fetches the live YAML for any K8s resource (status + managedFields stripped). */
  getResourceYaml: (sessionId: string, kind: string, namespace: string, name: string) =>
    apiClient.get<ResourceYaml>(`${BASE}/sessions/${sessionId}/k8s/resources/${encodeURIComponent(kind)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`),

  /**
   * Server-side-applies a YAML document for any resource kind.
   * Sends as text/plain to match the backend's @RequestBody String expectation.
   */
  applyResourceYaml: async (sessionId: string, yamlContent: string): Promise<PodActionResult> => {
    const { API_BASE_URL } = await import('@/config/api.config');
    const token = tokenStorage.getAccess();
    const response = await fetch(`${API_BASE_URL}${BASE}/sessions/${sessionId}/k8s/resources/yaml`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: yamlContent,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw { status: response.status, message: text || `Request failed: ${response.status}` };
    }
    return response.json() as Promise<PodActionResult>;
  },
};
