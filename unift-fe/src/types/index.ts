/**
 * Common Type Definitions
 */

// User Types
export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  avatar?: string;
  createdAt: string;
}

// File Types
export interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  owner: string;
  path: string;
  permissions?: FilePermission;
}

export interface FilePermission {
  read: boolean;
  write: boolean;
  delete: boolean;
  share: boolean;
}

// Transfer/Upload Types
export interface Transfer {
  id: string;
  type: 'upload' | 'download';
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'paused';
  startTime: string;
  endTime?: string;
  speed?: number; // bytes per second
  eta?: number; // seconds
  targetNode: string;
  error?: string;
}

export interface TransferHistory extends Transfer {
  completedAt: string;
  duration: number;
}

// Admin Types
export interface Directory {
  id: string;
  path: string;
  owner: string;
  createdAt: string;
}

export interface PermissionConfig {
  directoryId: string;
  userId: string;
  read: boolean;
  write: boolean;
  delete: boolean;
  admin: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Auth Types
export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// Filter Types
export interface FileFilter {
  searchQuery?: string;
  fileType?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'name' | 'date' | 'size';
  sortOrder?: 'asc' | 'desc';
}

export interface TransferFilter {
  status?: 'all' | 'completed' | 'failed';
  type?: 'upload' | 'download';
  dateRange?: 'day' | 'week' | 'all';
  searchQuery?: string;
}
