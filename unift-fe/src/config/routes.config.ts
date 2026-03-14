/**
 * Application Routes
 * Centralized routing configuration
 */

export const ROUTES = {
  PUBLIC: {
    LOGIN: '/login',
    FORGOT_PASSWORD: '/forgot-password',
  },
  PRIVATE: {
    DASHBOARD: '/dashboard',
    FILES: '/files',
    BROWSER: '/browser',
    UPLOAD: '/upload',
    HISTORY: '/history',
    TRANSFERS: '/transfers',
    ADMIN: '/admin',
    PERMISSIONS: '/admin/permissions',
    USERS: '/admin/users',
    MEDIA_PLAYER: '/media/player',
    SETTINGS: '/settings',
  },
  ERROR: {
    UNAUTHORIZED: '/401',
    FORBIDDEN: '/403',
    NOT_FOUND: '/404',
    SERVER_ERROR: '/500',
  },
} as const;
