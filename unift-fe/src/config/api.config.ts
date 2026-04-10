// API Base URL (Origin only). 
// Example: 'http://localhost:8080' or empty string for same-origin proxy.
// Note: Do NOT include '/api' here, as it is included in the individual endpoints.
export const API_BASE_URL = 
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8080";

export const API_ENDPOINTS = {
  auth: {
    register: '/api/auth/register',
    login:    '/api/auth/login',
    refresh:  '/api/auth/refresh',
    logout:   '/api/auth/logout',
  },
} as const;
