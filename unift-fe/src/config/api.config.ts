/**
 * API Configuration
 * Centralized API endpoints configuration
 */

export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api',
  auth: {
    login: import.meta.env.VITE_API_AUTH_LOGIN || 'http://localhost:8080/api/auth/login',
    logout: import.meta.env.VITE_API_AUTH_LOGOUT || 'http://localhost:8080/api/auth/logout',
  },
  files: {
    list: import.meta.env.VITE_API_FILES_LIST || 'http://localhost:8080/api/files',
    upload: import.meta.env.VITE_API_FILES_UPLOAD || 'http://localhost:8080/api/files/upload',
    delete: import.meta.env.VITE_API_FILES_DELETE || 'http://localhost:8080/api/files',
    search: import.meta.env.VITE_API_FILES_SEARCH || 'http://localhost:8080/api/files/search',
  },
  transfers: {
    history: import.meta.env.VITE_API_TRANSFERS_HISTORY || 'http://localhost:8080/api/transfers/history',
    stats: import.meta.env.VITE_API_TRANSFERS_STATS || 'http://localhost:8080/api/transfers/stats',
  },
  admin: {
    permissions: import.meta.env.VITE_API_ADMIN_PERMISSIONS || 'http://localhost:8080/api/admin/permissions',
    users: import.meta.env.VITE_API_ADMIN_USERS || 'http://localhost:8080/api/admin/users',
  },
  media: {
    stream: import.meta.env.VITE_API_MEDIA_STREAM || 'http://localhost:8080/api/media/stream',
  },
} as const;

export const APP_CONFIG = {
  name: import.meta.env.VITE_APP_NAME || 'UniFT',
  version: import.meta.env.VITE_APP_VERSION || '1.0.0',
  darkMode: import.meta.env.VITE_ENABLE_DARK_MODE === 'true',
} as const;
