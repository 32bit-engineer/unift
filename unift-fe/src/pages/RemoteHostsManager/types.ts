import type { DirectoryListingResponse, TransferStatusResponse } from '@/utils/remoteConnectionAPI';

export type ProtocolType = 'SSH_SFTP' | 'FTP' | 'SMB';
export type StatusFilter = 'all' | 'online' | 'offline' | 'warning';
export type FileEntry = DirectoryListingResponse['entries'][number];
export type { TransferStatusResponse };

export interface UIHost {
  sessionId: string;
  name: string;
  label?: string;
  status: 'online' | 'offline' | 'warning';
  userAtIp: string;
  protocol: string;
  port: number;
  lastConnected: string;
  latency: number;
}

export type ModalState =
  | { type: 'none' }
  | { type: 'delete'; entries: FileEntry[] }
  | { type: 'rename'; entry: FileEntry }
  | { type: 'newFolder' }
  | { type: 'newFile' };

export type EditorState =
  | { mode: 'folder'; folderPath: string }
  | { mode: 'files'; paths: string[] };

export interface ConnectionFormData {
  name: string;
  host: string;
  port: string;
  username: string;
  password: string;
  privateKey: string;
  passphrase: string;
  remotePath: string;
  sessionTtlMinutes: string;
  strictHostKeyChecking: boolean;
  expectedFingerprint: string;
  saveConnection: boolean;
  autoReconnect: boolean;
}
