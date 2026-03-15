// Shared TypeScript interfaces used across 3+ files

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
  expires_in:    number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username:     string;
  password:     string;
  email?:       string;
  firstName?:   string;
  lastName?:    string;
  phoneNumber?: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

// ─── API Error ─────────────────────────────────────────────────────────────

export interface ApiError {
  status:    number;
  message:   string;
  timestamp?: string;
}

// ─── User (decoded from JWT / stored in auth store) ───────────────────────

export interface AuthUser {
  username: string;
}
