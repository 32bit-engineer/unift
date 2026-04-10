import { apiClient, authenticatedFetch, tokenStorage } from '@/utils/apiClient';
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
  /** Workspace types currently active for this session (always includes "ssh"). */
  activeWorkspaces?: string[];
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

export interface ContainerDetail {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  platform: string;
  created: string;
  restartCount: number;
  env: string[];
  cmd: string[];
  ports: Record<string, string>;
  mounts: Array<{ type: string; source: string; destination: string; mode: string }>;
  networkMode: string;
  networks: Record<string, { ipAddress: string; gateway: string }>;
  restartPolicy: string;
  labels: Record<string, string>;
}

export interface CreateContainerRequest {
  image: string;
  name?: string;
  env?: string[];
  ports?: Record<string, string>;
  volumes?: string[];
  restartPolicy?: string;
  networkMode?: string;
  command?: string[];
}

export interface CreateContainerResponse {
  containerId: string;
  warnings: string[];
}

export interface ExecCreateRequest {
  containerId: string;
  cmd: string[];
  attachStdout?: boolean;
  attachStderr?: boolean;
}

export interface ExecStartResult {
  output: string;
  exitCode: number;
}

export interface ContainerStats {
  containerId: string;
  name: string;
  cpuPercent: string;
  memoryUsage: string;
  memoryLimit: string;
  memoryPercent: string;
  networkIo: string;
  blockIo: string;
  pids: number;
}

export interface PullImageProgress {
  status: string;
  id?: string;
  progress?: string;
  progressDetail?: { current?: number; total?: number };
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  ipam: { subnet?: string; gateway?: string };
  containers: Record<string, { name: string; ipv4Address: string }>;
  labels: Record<string, string>;
  created: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  scope: string;
  labels: Record<string, string>;
  created: string;
  usageData?: { size: number; refCount: number };
}

export interface ComposeProject {
  name: string;
  status: string;
  configFiles: string;
  services: string[];
  containerCount: number;
}

export interface ComposeServiceDef {
  image: string;
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  depends_on?: string[];
}

export interface ComposeFileRequest {
  projectName: string;
  services: Record<string, ComposeServiceDef>;
}

interface RawDockerInfo {
  available: boolean;
  version: string;
  apiVersion?: string;
  os?: string;
  arch?: string;
  totalContainers: number;
  runningContainers: number;
  stoppedContainers: number;
  pausedContainers: number;
  totalImages: number;
  storageDriver: string;
}

interface RawDockerContainer {
  id: string;
  name?: string;
  image: string;
  imageId?: string;
  state: string;
  status: string;
  ports?: string[];
  createdAt: string;
  sizeRw?: number | null;
  sizeRootFs?: number | null;
  networks?: string[];
}

interface RawDockerStats {
  containerId: string;
  name: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
}

interface RawDockerOverview {
  info: RawDockerInfo;
  runningContainers: RawDockerContainer[];
  stats: RawDockerStats[];
}

interface RawDockerImage {
  id: string;
  repoTags?: string[];
  size: number;
  created: string;
  labels?: Record<string, string>;
}

interface RawImagePage {
  images: RawDockerImage[];
  total: number;
}

interface RawContainerDetail {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  platform?: string;
  env?: string[];
  command?: string;
  ports?: string[];
  mounts?: string[];
  networkSettings?: Record<string, unknown>;
  restartPolicy?: string;
}

interface RawCreateContainerResponse {
  id: string;
  warnings?: string[];
}

interface RawDockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  containers?: Record<string, string>;
  ipam?: Record<string, unknown>;
}

interface RawDockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  scope?: string;
  labels?: Record<string, string>;
  createdAt?: string;
}

interface RawComposeProject {
  name: string;
  status: string;
  configFiles: string;
  services: number;
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

function formatDockerBytes(bytes: number | null | undefined): string {
  const safeBytes = Math.max(0, bytes ?? 0);
  if (safeBytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(safeBytes) / Math.log(1024)), units.length - 1);
  const value = safeBytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
}

function formatDockerPercent(value: number | null | undefined): string {
  const safeValue = Number.isFinite(value) ? Number(value) : 0;
  return `${safeValue.toFixed(1)}%`;
}

function normalizeDockerInfo(info: RawDockerInfo): DockerInfo {
  const osPart = info.os?.trim() ?? '';
  const archPart = info.arch?.trim() ?? '';
  const serverOs = [osPart, archPart].filter(Boolean).join(' / ');

  return {
    available: info.available,
    version: info.version,
    totalContainers: info.totalContainers,
    runningContainers: info.runningContainers,
    stoppedContainers: info.stoppedContainers,
    pausedContainers: info.pausedContainers,
    totalImages: info.totalImages,
    serverOs,
    storageDriver: info.storageDriver,
  };
}

function normalizeDockerContainer(container: RawDockerContainer): DockerContainer {
  return {
    id: container.id,
    names: container.name ?? '',
    image: container.image,
    state: container.state,
    status: container.status,
    ports: container.ports?.join(', ') ?? '',
    createdAt: container.createdAt,
    size: formatDockerBytes(container.sizeRootFs ?? container.sizeRw),
    networks: container.networks?.join(', ') ?? '',
  };
}

function normalizeDockerStats(stats: RawDockerStats): DockerContainerStats {
  return {
    containerId: stats.containerId,
    name: stats.name,
    cpuPercent: formatDockerPercent(stats.cpuPercent),
    memoryUsage: `${formatDockerBytes(stats.memoryUsage)} / ${formatDockerBytes(stats.memoryLimit)}`,
    memoryLimit: formatDockerBytes(stats.memoryLimit),
    memoryPercent: formatDockerPercent(stats.memoryPercent),
    networkIo: `${formatDockerBytes(stats.networkRx)} / ${formatDockerBytes(stats.networkTx)}`,
    blockIo: `${formatDockerBytes(stats.blockRead)} / ${formatDockerBytes(stats.blockWrite)}`,
  };
}

function splitRepoTag(repoTag: string | undefined): { repository: string; tag: string } {
  if (!repoTag) return { repository: '<none>', tag: '<none>' };
  const slashIndex = repoTag.lastIndexOf('/');
  const colonIndex = repoTag.lastIndexOf(':');
  if (colonIndex > slashIndex) {
    return {
      repository: repoTag.slice(0, colonIndex),
      tag: repoTag.slice(colonIndex + 1),
    };
  }
  return { repository: repoTag, tag: 'latest' };
}

function normalizeDockerImage(image: RawDockerImage): DockerImage[] {
  const tags = image.repoTags && image.repoTags.length > 0 ? image.repoTags : ['<none>:<none>'];
  return tags.map((repoTag) => {
    const parsed = splitRepoTag(repoTag);
    return {
      id: image.id,
      repository: parsed.repository,
      tag: parsed.tag,
      size: formatDockerBytes(image.size),
      createdAt: image.created,
      createdSince: image.created,
    };
  });
}

function normalizeContainerDetail(detail: RawContainerDetail): ContainerDetail {
  const ports = (detail.ports ?? []).reduce<Record<string, string>>((acc, port, index) => {
    acc[`port-${index + 1}`] = port;
    return acc;
  }, {});
  const mounts = (detail.mounts ?? []).map((mount) => {
    const [source = '', destination = ''] = mount.split(':', 2);
    return { type: 'bind', source, destination, mode: '' };
  });

  return {
    id: detail.id,
    name: detail.name,
    image: detail.image,
    state: detail.state,
    status: detail.status,
    platform: detail.platform ?? '',
    created: '',
    restartCount: 0,
    env: detail.env ?? [],
    cmd: detail.command ? detail.command.split(' ') : [],
    ports,
    mounts,
    networkMode: '',
    networks: {},
    restartPolicy: detail.restartPolicy ?? '',
    labels: {},
  };
}

function normalizeDockerNetwork(network: RawDockerNetwork): DockerNetwork {
  const containers = Object.entries(network.containers ?? {}).reduce<Record<string, { name: string; ipv4Address: string }>>(
    (acc, [id, ipv4Address]) => {
      acc[id] = { name: id, ipv4Address };
      return acc;
    },
    {},
  );
  const ipamConfig = Array.isArray(network.ipam?.Config)
    ? (network.ipam?.Config as Array<Record<string, string>>)[0]
    : undefined;

  return {
    id: network.id,
    name: network.name,
    driver: network.driver,
    scope: network.scope,
    internal: network.internal,
    ipam: {
      subnet: ipamConfig?.Subnet,
      gateway: ipamConfig?.Gateway,
    },
    containers,
    labels: {},
    created: '',
  };
}

function normalizeDockerVolume(volume: RawDockerVolume): DockerVolume {
  return {
    name: volume.name,
    driver: volume.driver,
    mountpoint: volume.mountpoint,
    scope: volume.scope ?? '',
    labels: volume.labels ?? {},
    created: volume.createdAt ?? '',
  };
}

function normalizeComposeProject(project: RawComposeProject): ComposeProject {
  return {
    name: project.name,
    status: project.status,
    configFiles: project.configFiles,
    services: Array.from({ length: project.services }, (_, index) => `service-${index + 1}`),
    containerCount: project.services,
  };
}

const BASE = '/api/remote';
const HOSTS_BASE = '/api/hosts';
const STREAM_BASE = '/api/stream';
const TRANSFER_HISTORY_BASE = '/api/transfers/history';
const UPLOADS_BASE = '/api/uploads/sessions';

async function streamSse<T>(
  url: string,
  onData: (payload: T) => void,
  onError: (err: string) => void,
  transform?: (value: unknown) => T,
): Promise<() => void> {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await authenticatedFetch(url, { signal: controller.signal });
      if (!res.ok || !res.body) {
        onError(`HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
            continue;
          }

          if (line.startsWith('data:')) {
            const raw = line.slice(5).trimStart();
            if (currentEvent === 'error') {
              onError(raw || 'Stream error');
              continue;
            }
            try {
              const parsed = JSON.parse(raw) as unknown;
              onData(transform ? transform(parsed) : (parsed as T));
            } catch {
              // Ignore keepalive/non-JSON lines.
            }
            continue;
          }

          if (line === '') {
            currentEvent = '';
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      onError(err instanceof Error ? err.message : 'Stream failed');
    }
  })();

  return () => controller.abort();
}

export const remoteConnectionAPI = {
  connect: (request: ConnectRequest) =>
    apiClient.post<SessionState>(`${BASE}/sessions`, request),

  listSessions: () =>
    apiClient.get<SessionState[]>(`${BASE}/sessions`),

  getSession: (sessionId: string) =>
    apiClient.get<SessionState>(`${BASE}/sessions/${sessionId}`),

  closeSession: (sessionId: string) =>
    apiClient.delete<void>(`${BASE}/sessions/${sessionId}`),

  /** Activates a workspace type for the session. Returns the updated set. */
  activateWorkspace: (sessionId: string, type: WorkspaceType) =>
    apiClient.post<string[]>(`${BASE}/sessions/${sessionId}/workspaces/${type}`),

  /** Deactivates a workspace type for the session. Returns the updated set. */
  deactivateWorkspace: (sessionId: string, type: WorkspaceType) =>
    apiClient.delete<string[]>(`${BASE}/sessions/${sessionId}/workspaces/${type}`),

  /** Returns the set of workspace types currently active for the session. */
  getActiveWorkspaces: (sessionId: string) =>
    apiClient.get<string[]>(`${BASE}/sessions/${sessionId}/workspaces`),

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

  /**
   * Streams transfer statuses for a session via SSE.
   * Returns a stop function to abort the stream.
   */
  streamTransfers: async (
    sessionId: string,
    intervalMs: number,
    onData: (transfers: TransferStatusResponse[]) => void,
    onError: (err: string) => void,
  ): Promise<() => void> => {
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/transfers/stream?intervalMs=${Math.max(500, intervalMs)}`;
    return streamSse<TransferStatusResponse[]>(url, onData, onError);
  },

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
   * Streams live session analytics snapshots via SSE.
   * Returns a stop function to abort the stream.
   */
  streamSessionAnalytics: async (
    sessionId: string,
    intervalMs: number,
    onData: (analytics: SessionAnalyticsResponse) => void,
    onError: (err: string) => void,
  ): Promise<() => void> => {
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/analytics/stream?intervalMs=${Math.max(1000, intervalMs)}`;
    return streamSse<SessionAnalyticsResponse>(url, onData, onError);
  },

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

  /**
   * Streams aggregate transfer-history stats via SSE.
   * Returns a stop function to abort the stream.
   */
  streamTransferHistoryStats: async (
    intervalMs: number,
    onData: (stats: TransferHistoryStatsResponse) => void,
    onError: (err: string) => void,
  ): Promise<() => void> => {
    const url = `${API_BASE_URL}${TRANSFER_HISTORY_BASE}/stats/stream?intervalMs=${Math.max(1000, intervalMs)}`;
    return streamSse<TransferHistoryStatsResponse>(url, onData, onError);
  },

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
    apiClient
      .get<RawDockerInfo>(`${BASE}/sessions/${sessionId}/docker/info`)
      .then(normalizeDockerInfo),

  /** Returns Docker overview: info + running containers + live stats. */
  getDockerOverview: (sessionId: string) =>
    apiClient
      .get<RawDockerOverview>(`${BASE}/sessions/${sessionId}/docker/overview`)
      .then((overview) => ({
        info: normalizeDockerInfo(overview.info),
        runningContainers: overview.runningContainers.map(normalizeDockerContainer),
        stats: overview.stats.map(normalizeDockerStats),
      })),

  /**
   * Streams Docker overview snapshots via SSE.
   * Returns a stop function to abort the stream.
   */
  streamDockerOverview: async (
    sessionId: string,
    intervalMs: number,
    onData: (overview: DockerOverview) => void,
    onError: (err: string) => void,
  ): Promise<() => void> => {
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/docker/overview/stream?intervalMs=${Math.max(1000, intervalMs)}`;
    return streamSse<DockerOverview>(
      url,
      onData,
      onError,
      (value) => {
        const overview = value as RawDockerOverview;
        return {
          info: normalizeDockerInfo(overview.info),
          runningContainers: overview.runningContainers.map(normalizeDockerContainer),
          stats: overview.stats.map(normalizeDockerStats),
        };
      },
    );
  },

  /**
   * Streams Docker system info (engine version, OS, container/image counts) via SSE.
   * Default interval 30 s — engine metadata and counts change infrequently.
   * Stream remains active until the returned stop function is called.
   */
  streamDockerSystemInfo: async (
    sessionId: string,
    intervalMs: number,
    onData: (info: DockerInfo) => void,
    onError: (err: string) => void,
  ): Promise<() => void> => {
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/docker/system-info/stream?intervalMs=${Math.max(5000, intervalMs)}`;
    return streamSse<DockerInfo>(
      url,
      onData,
      onError,
      (value) => normalizeDockerInfo(value as RawDockerInfo),
    );
  },

  /**
   * Streams the flat list of currently running containers via SSE (no stats).
   * Default interval 5 s — updates when containers start or stop.
   * Combine with streamDockerContainerStatsAll for live per-container metrics.
   * Stream remains active until the returned stop function is called.
   */
  streamDockerRunningContainers: async (
    sessionId: string,
    intervalMs: number,
    onData: (containers: DockerContainer[]) => void,
    onError: (err: string) => void,
  ): Promise<() => void> => {
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/docker/containers/running/stream?intervalMs=${Math.max(1000, intervalMs)}`;
    return streamSse<DockerContainer[]>(
      url,
      onData,
      onError,
      (value) => (value as RawDockerContainer[]).map(normalizeDockerContainer),
    );
  },

  /** Lists Docker containers with optional pagination. */
  listDockerContainers: (sessionId: string, all = true, page = 0, pageSize = 20) =>
    apiClient
      .get<{ containers: RawDockerContainer[]; total: number; page: number; pageSize: number }>(
        `${BASE}/sessions/${sessionId}/docker/containers?all=${all}&page=${page}&pageSize=${pageSize}`,
      )
      .then((res) => ({
        containers: res.containers.map(normalizeDockerContainer),
        total: res.total,
        page: res.page,
        pageSize: res.pageSize,
      })),

  /** Returns live stats for all running containers. */
  getDockerContainerStats: (sessionId: string) =>
    apiClient
      .get<RawDockerStats[]>(`${BASE}/sessions/${sessionId}/docker/containers/stats`)
      .then((stats) => stats.map(normalizeDockerStats)),

  /**
   * Streams point-in-time stats for all running containers via SSE.
   * Returns a stop function to abort the stream.
   */
  streamDockerContainerStatsAll: async (
    sessionId: string,
    intervalMs: number,
    onData: (stats: DockerContainerStats[]) => void,
    onError: (err: string) => void,
  ): Promise<() => void> => {
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/docker/containers/stats/stream?intervalMs=${Math.max(1000, intervalMs)}`;
    return streamSse<DockerContainerStats[]>(
      url,
      onData,
      onError,
      (value) => (value as RawDockerStats[]).map(normalizeDockerStats),
    );
  },

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
    apiClient
      .get<RawImagePage>(`${BASE}/sessions/${sessionId}/docker/images`)
      .then((res) => {
        const images = res.images.flatMap(normalizeDockerImage);
        return {
          images,
          total: images.length,
        };
      }),

  /** Removes a Docker image from the remote host. */
  removeDockerImage: (sessionId: string, imageId: string) =>
    apiClient.delete<ContainerActionResult>(`${BASE}/sessions/${sessionId}/docker/images/${imageId}`),

  /** Inspects a container for detailed configuration. */
  inspectDockerContainer: (sessionId: string, containerId: string) =>
    apiClient
      .get<RawContainerDetail>(`${BASE}/sessions/${sessionId}/docker/containers/${containerId}`)
      .then(normalizeContainerDetail),

  /** Creates a new container from an image. */
  createDockerContainer: (sessionId: string, request: CreateContainerRequest) =>
    apiClient
      .post<RawCreateContainerResponse>(`${BASE}/sessions/${sessionId}/docker/containers`, request)
      .then((res) => ({
        containerId: res.id,
        warnings: res.warnings ?? [],
      })),

  /** Pauses a running container. */
  pauseDockerContainer: (sessionId: string, containerId: string) =>
    apiClient.post<ContainerActionResult>(`${BASE}/sessions/${sessionId}/docker/containers/${containerId}/pause`),

  /** Unpauses a paused container. */
  unpauseDockerContainer: (sessionId: string, containerId: string) =>
    apiClient.post<ContainerActionResult>(`${BASE}/sessions/${sessionId}/docker/containers/${containerId}/unpause`),

  /** Renames a container. */
  renameDockerContainer: (sessionId: string, containerId: string, newName: string) =>
    apiClient.patch<ContainerActionResult>(
      `${BASE}/sessions/${sessionId}/docker/containers/${containerId}/rename?name=${encodeURIComponent(newName)}`,
    ),

  /** Executes a command inside a running container. */
  execInContainer: (sessionId: string, request: ExecCreateRequest) =>
    apiClient.post<ExecStartResult>(
      `${BASE}/sessions/${sessionId}/docker/containers/${request.containerId}/exec`,
      request,
    ),

  /**
   * Streams container logs via SSE.
   * Returns a stop function to abort the stream.
   */
  streamDockerContainerLogs: async (
    sessionId: string,
    containerId: string,
    tail: number,
    timestamps: boolean,
    onLine: (line: string) => void,
    onComplete: () => void,
    onError: (err: string) => void,
  ): Promise<() => void> => {
    const { API_BASE_URL } = await import('@/config/api.config');
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/docker/containers/${containerId}/logs/stream?tail=${tail}&timestamps=${timestamps}`;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await authenticatedFetch(url, {
          signal: controller.signal,
        });
        if (!res.ok || !res.body) { onError(`HTTP ${res.status}`); return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';
        let completedCalled = false;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (!completedCalled) onComplete();
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            if (part.startsWith('event:')) {
              currentEvent = part.slice(6).trim();
            } else if (part.startsWith('data:')) {
              const data = part.slice(5).trimStart();
              if (currentEvent === 'end') {
                completedCalled = true;
                onComplete();
              } else if (currentEvent === 'error') {
                onError(data);
              } else {
                onLine(data);
              }
            } else if (part === '') {
              currentEvent = '';
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        onError(err instanceof Error ? err.message : 'Stream failed');
      }
    })();
    return () => controller.abort();
  },

  /**
   * Streams live container stats via SSE.
   * Returns a stop function to abort the stream.
   */
  streamDockerContainerStats: async (
    sessionId: string,
    containerId: string,
    onData: (stats: ContainerStats) => void,
    onError: (err: string) => void,
  ): Promise<() => void> => {
    const { API_BASE_URL } = await import('@/config/api.config');
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/docker/containers/${containerId}/stats/stream`;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await authenticatedFetch(url, {
          signal: controller.signal,
        });
        if (!res.ok || !res.body) { onError(`HTTP ${res.status}`); return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            if (part.startsWith('event:')) {
              currentEvent = part.slice(6).trim();
            } else if (part.startsWith('data:')) {
              if (currentEvent === 'error') {
                let msg = part.slice(5).trimStart();
                try { msg = (JSON.parse(msg) as { message?: string }).message ?? msg; } catch { /* keep raw */ }
                onError(msg);
                return;
              }
              if (currentEvent === 'end') {
                return;
              }
              try {
                const parsed = JSON.parse(part.slice(5).trimStart()) as RawDockerStats;
                const normalized = normalizeDockerStats(parsed);
                onData({
                  ...normalized,
                  pids: parsed.pids,
                });
              } catch { /* skip non-JSON lines */ }
            } else if (part === '') {
              currentEvent = '';
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        onError(err instanceof Error ? err.message : 'Stream failed');
      }
    })();
    return () => controller.abort();
  },

  /**
   * Pulls a Docker image with streaming progress via SSE.
   * Returns a stop function to abort.
   */
  pullDockerImage: async (
    sessionId: string,
    repository: string,
    tag: string,
    onProgress: (p: PullImageProgress) => void,
    onComplete: () => void,
    onError: (err: string) => void,
  ): Promise<() => void> => {
    const { API_BASE_URL } = await import('@/config/api.config');
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/docker/images/pull?repository=${encodeURIComponent(repository)}&tag=${encodeURIComponent(tag)}`;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await authenticatedFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ repository, tag }),
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
            if (part.startsWith('data:')) {
              try {
                const parsed = JSON.parse(part.slice(5).trimStart()) as PullImageProgress;
                onProgress(parsed);
              } catch { /* skip non-JSON lines */ }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        onError(err instanceof Error ? err.message : 'Pull failed');
      }
    })();
    return () => controller.abort();
  },

  /** Tags a Docker image with a new repository:tag. */
  tagDockerImage: (sessionId: string, imageId: string, repo: string, tag: string) =>
    apiClient.post<ContainerActionResult>(
      `${BASE}/sessions/${sessionId}/docker/images/${imageId}/tag?repo=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`,
      {},
    ),

  /** Removes unused Docker images. */
  pruneDockerImages: (sessionId: string) =>
    apiClient.post<void>(`${BASE}/sessions/${sessionId}/docker/images/prune`, {}),

  /** Lists Docker networks. */
  listDockerNetworks: (sessionId: string) =>
    apiClient
      .get<RawDockerNetwork[]>(`${BASE}/sessions/${sessionId}/docker/networks`)
      .then((networks) => networks.map(normalizeDockerNetwork)),

  /** Inspects a Docker network. */
  inspectDockerNetwork: (sessionId: string, networkId: string) =>
    apiClient
      .get<RawDockerNetwork>(`${BASE}/sessions/${sessionId}/docker/networks/${networkId}`)
      .then(normalizeDockerNetwork),

  /** Creates a Docker network. */
  createDockerNetwork: (sessionId: string, name: string, driver: string) =>
    apiClient.post<{ id: string }>(`${BASE}/sessions/${sessionId}/docker/networks`, { name, driver }),

  /** Removes a Docker network. */
  removeDockerNetwork: (sessionId: string, networkId: string) =>
    apiClient.delete<void>(`${BASE}/sessions/${sessionId}/docker/networks/${networkId}`),

  /** Lists Docker volumes. */
  listDockerVolumes: (sessionId: string) =>
    apiClient
      .get<RawDockerVolume[]>(`${BASE}/sessions/${sessionId}/docker/volumes`)
      .then((volumes) => volumes.map(normalizeDockerVolume)),

  /** Inspects a Docker volume. */
  inspectDockerVolume: (sessionId: string, volumeName: string) =>
    apiClient
      .get<RawDockerVolume>(`${BASE}/sessions/${sessionId}/docker/volumes/${volumeName}`)
      .then(normalizeDockerVolume),

  /** Creates a Docker volume. */
  createDockerVolume: (sessionId: string, name: string, driver: string) =>
    apiClient
      .post<RawDockerVolume>(`${BASE}/sessions/${sessionId}/docker/volumes`, { name, driver })
      .then(normalizeDockerVolume),

  /** Removes a Docker volume. */
  removeDockerVolume: (sessionId: string, volumeName: string) =>
    apiClient.delete<void>(`${BASE}/sessions/${sessionId}/docker/volumes/${volumeName}`),

  /** Lists Docker Compose projects detected from running containers. */
  listDockerComposeProjects: (sessionId: string) =>
    apiClient
      .get<RawComposeProject[]>(`${BASE}/sessions/${sessionId}/docker/compose/projects`)
      .then((projects) => projects.map(normalizeComposeProject)),

  /** Generates a Docker Compose YAML from current running containers or a request. */
  generateDockerComposeFile: async (sessionId: string, request: ComposeFileRequest): Promise<string> => {
    const payload = await apiClient.post<{ yaml?: string }>(
      `${BASE}/sessions/${sessionId}/docker/compose/generate`,
      {
        projectName: request.projectName,
        services: Object.entries(request.services).map(([name, service]) => ({
          name,
          image: service.image,
          ports: service.ports,
          environment: service.environment,
          volumes: service.volumes,
          dependsOn: service.depends_on,
        })),
      },
    );
    return payload.yaml ?? '';
  },

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
    container: string,
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
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'container': container, // container name 
          },
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
