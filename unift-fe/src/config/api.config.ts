// API base URL — reads from Vite env, falls back to local dev server
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export const API_ENDPOINTS = {
  auth: {
    register: '/api/auth/register',
    login:    '/api/auth/login',
    refresh:  '/api/auth/refresh',
    logout:   '/api/auth/logout',
  },
} as const;
