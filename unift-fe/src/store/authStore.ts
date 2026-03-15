import { create } from 'zustand';
import { apiClient, tokenStorage } from '@/utils/apiClient';
import { API_ENDPOINTS } from '@/config/api.config';
import type {
  AuthUser,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  ApiError,
} from '@/types';

interface AuthState {
  user:          AuthUser | null;
  isAuthenticated: boolean;
  isLoading:     boolean;
  error:         string | null;

  login:    (payload: LoginRequest)    => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout:   ()                         => Promise<void>;
  clearError: ()                       => void;
}

// Decode username from JWT payload (no library needed — just base64)
function decodeUsername(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function hydrateUser(): AuthUser | null {
  const token = tokenStorage.getAccess();
  if (!token) return null;
  const username = decodeUsername(token);
  return username ? { username } : null;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:            hydrateUser(),
  isAuthenticated: !!tokenStorage.getAccess(),
  isLoading:       false,
  error:           null,

  clearError: () => set({ error: null }),

  login: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.post<AuthResponse>(
        API_ENDPOINTS.auth.login,
        payload,
        { skipAuth: true },
      );
      tokenStorage.setAccess(res.access_token);
      tokenStorage.setRefresh(res.refresh_token);
      const username = decodeUsername(res.access_token) ?? payload.username;
      set({ user: { username }, isAuthenticated: true, isLoading: false });
    } catch (err) {
      const message = (err as ApiError).message ?? 'Login failed. Please try again.';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  register: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.post<AuthResponse>(
        API_ENDPOINTS.auth.register,
        payload,
        { skipAuth: true },
      );
      tokenStorage.setAccess(res.access_token);
      tokenStorage.setRefresh(res.refresh_token);
      const username = decodeUsername(res.access_token) ?? payload.username;
      set({ user: { username }, isAuthenticated: true, isLoading: false });
    } catch (err) {
      const message = (err as ApiError).message ?? 'Registration failed. Please try again.';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    const refreshToken = tokenStorage.getRefresh();
    if (refreshToken) {
      try {
        await apiClient.post(API_ENDPOINTS.auth.logout, { refresh_token: refreshToken });
      } catch {
        // best-effort — clear locally regardless
      }
    }
    tokenStorage.clear();
    set({ user: null, isAuthenticated: false, error: null });
  },
}));
