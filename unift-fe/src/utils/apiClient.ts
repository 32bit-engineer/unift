import { API_BASE_URL, API_ENDPOINTS } from '@/config/api.config';
import type { ApiError, AuthResponse } from '@/types';

// ─── Token storage helpers ─────────────────────────────────────────────────

const ACCESS_TOKEN_KEY  = 'unift_access_token';
const REFRESH_TOKEN_KEY = 'unift_refresh_token';

export const tokenStorage = {
  getAccess:  ()          => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: ()          => localStorage.getItem(REFRESH_TOKEN_KEY),
  setAccess:  (t: string) => localStorage.setItem(ACCESS_TOKEN_KEY, t),
  setRefresh: (t: string) => localStorage.setItem(REFRESH_TOKEN_KEY, t),
  clear:      ()          => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

// ─── Refresh-lock 
// A singleton promise so that concurrent 401s share one refresh attempt
// instead of each trying to rotate the refresh token independently (which
// would cause all but the first to fail with a revoked-token 401).

let refreshPromise: Promise<boolean> | null = null;

function attemptTokenRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<boolean> => {
    const refreshToken = tokenStorage.getRefresh();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.auth.refresh}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) return false;

      const refreshed = (await response.json()) as AuthResponse;
      tokenStorage.setAccess(refreshed.access_token);
      tokenStorage.setRefresh(refreshed.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      // Release the lock so future expiries can trigger a new refresh
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ─── Core fetch wrapper ────────────────────────────────────────────────────

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
  /** @internal used to prevent infinite refresh loops */
  _isRetry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuth = false, _isRetry = false, headers: extraHeaders = {}, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  };

  if (!skipAuth) {
    const token = tokenStorage.getAccess();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // ── 401 handling: attempt token refresh once, then give up
  if (response.status === 401 && !skipAuth && !_isRetry && !path.startsWith('/api/auth')) {
    const refreshed = await attemptTokenRefresh();

    if (refreshed) {
      // Retry the original request with the new access token
      return request<T>(path, { ...options, _isRetry: true });
    }

    // Refresh failed — log out and redirect to login
    tokenStorage.clear();
    window.location.href = '?page=login';
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const errBody = (await response.json()) as { message?: string };
      if (errBody.message) errorMessage = errBody.message;
    } catch {
      // ignore parse errors
    }

    const err: ApiError = { status: response.status, message: errorMessage };
    throw err;
  }

  // Handle empty bodies: 204 No Content, or 200 with empty body (e.g. ResponseEntity<Void>)
  if (response.status === 204) return undefined as unknown as T;
  const text = await response.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

// ─── Convenience methods ───────────────────────────────────────────────────

export const apiClient = {
  get:    <T>(path: string, opts?: RequestOptions)                          => request<T>(path, { ...opts, method: 'GET' }),
  post:   <T>(path: string, body?: unknown, opts?: RequestOptions)          => request<T>(path, { ...opts, method: 'POST', body }),
  put:    <T>(path: string, body?: unknown, opts?: RequestOptions)          => request<T>(path, { ...opts, method: 'PUT', body }),
  patch:  <T>(path: string, body?: unknown, opts?: RequestOptions)          => request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: RequestOptions)                          => request<T>(path, { ...opts, method: 'DELETE' }),
};

/**
 * Extracts a human-readable message from anything thrown in a catch block.
 * Handles:
 *  - ApiError plain objects  { status, message }  thrown by apiClient
 *  - native Error instances
 *  - anything else → falls back to the provided fallback string
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}
