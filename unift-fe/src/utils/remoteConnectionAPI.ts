import { apiClient, tokenStorage } from '@/utils/apiClient';
import { API_BASE_URL } from '@/config/api.config';


export type ProtocolType = 'SSH_SFTP' | 'FTP' | 'SMB';

export type SshAuthType = 'PASSWORD' | 'PRIVATE_KEY' | 'PRIVATE_KEY_PASSPHRASE';

export interface ConnectRequest {
  protocol: ProtocolType;
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
}

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
};
