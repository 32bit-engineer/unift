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

  // ── 401 handling: attempt token refresh once, then give up ──────────────
  if (response.status === 401 && !skipAuth && !_isRetry && !path.startsWith('/api/auth')) {
    const refreshToken = tokenStorage.getRefresh();
    if (refreshToken) {
      try {
        const refreshResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.auth.refresh}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshResponse.ok) {
          const refreshed = (await refreshResponse.json()) as AuthResponse;
          tokenStorage.setAccess(refreshed.access_token);
          tokenStorage.setRefresh(refreshed.refresh_token);

          // Retry the original request with the new access token
          return request<T>(path, { ...options, _isRetry: true });
        }
      } catch {
        // refresh request itself failed — fall through to clear + redirect
      }
    }

    // Refresh failed or no refresh token — log out and redirect
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

  // Handle 204 No Content
  if (response.status === 204) return undefined as unknown as T;

  return response.json() as Promise<T>;
}

// ─── Convenience methods ───────────────────────────────────────────────────

export const apiClient = {
  get:    <T>(path: string, opts?: RequestOptions)                          => request<T>(path, { ...opts, method: 'GET' }),
  post:   <T>(path: string, body?: unknown, opts?: RequestOptions)          => request<T>(path, { ...opts, method: 'POST', body }),
  put:    <T>(path: string, body?: unknown, opts?: RequestOptions)          => request<T>(path, { ...opts, method: 'PUT', body }),
  patch:  <T>(path: string, body?: unknown, opts?: RequestOptions)          => request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: RequestOptions)                          => request<T>(path, { ...opts, method: 'DELETE' }),
};
