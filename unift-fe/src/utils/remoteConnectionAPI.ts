import { apiClient, tokenStorage } from '@/utils/apiClient';
import { API_BASE_URL } from '@/config/api.config';

// ─── Types ─────────────────────────────────────────────────────────────────

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

// ─── API ───────────────────────────────────────────────────────────────────

const BASE = '/api/remote';

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
};
