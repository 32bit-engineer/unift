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
  protocol: ProtocolType;
  host: string;
  port: number;
  username: string;
  state: SessionStateType;
  createdAt: string;
  expiresAt: string;
  homeDirectory?: string;
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

export interface ConnectFromSavedResponse {
  sessionId: string;
  label?: string;
  protocol: ProtocolType;
  host: string;
  port: number;
  username: string;
  state: string;
  createdAt: string;
  expiresAt: string;
  homeDirectory?: string;
}

const BASE = '/api/remote';
const HOSTS_BASE = '/api/hosts';
const STREAM_BASE = '/api/stream';

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
   * Uploads a File/Blob to the given remote path.
   * Returns the server-assigned transferId.
   */
  uploadFile: async (sessionId: string, remotePath: string, file: File): Promise<string> => {
    const token = tokenStorage.getAccess();
    const url = `${API_BASE_URL}${BASE}/sessions/${sessionId}/files/upload?path=${encodeURIComponent(remotePath)}`;
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
    return response.text();
  },

  getTransfers: (sessionId: string) =>
    apiClient.get<TransferStatusResponse[]>(`${BASE}/sessions/${sessionId}/transfers`),

  getTransfer: (sessionId: string, transferId: string) =>
    apiClient.get<TransferStatusResponse>(`${BASE}/sessions/${sessionId}/transfers/${transferId}`),

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
};
