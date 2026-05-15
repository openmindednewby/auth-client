import type { HttpClient } from '../http/HttpClient';

/**
 * Backend session record returned by `GET /me/sessions`.
 *
 * Shape mirrors the existing IdentityService response — see
 * `Services/Identity/.../GetSessions.cs`. Defined as a permissive interface
 * so newer fields (added server-side) flow through without a package bump.
 */
export interface AuthSessionInfo {
  id: string;
  isCurrent?: boolean;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: string;
  lastSeenAt?: string;
  [key: string]: unknown;
}

export interface AuthApiClientOptions {
  http: HttpClient;
  /** API base, e.g. `https://api.dloizides.com`. No trailing slash needed. */
  baseUrl: string;
  /**
   * Optional supplier of the current access token, used as a Bearer header on
   * authenticated calls (sessions list, revoke, logout). When omitted those
   * calls send no Authorization header — typical for cookie-based web auth.
   */
  getAccessToken?: () => Promise<string | null>;
  /**
   * When true, every request adds `credentials: 'include'`. Required for
   * cookie-based web auth (`__Host-refresh` lives in an httpOnly cookie).
   */
  useCredentials?: boolean;
}

export interface OtpLoginRequest {
  email: string;
  otp: string;
  tenantId?: string;
  offlineAccess?: boolean;
}

export interface PasswordLoginRequest {
  email: string;
  password: string;
  tenantId?: string;
  offlineAccess?: boolean;
}

export interface ForgotPasswordRequest {
  email: string;
  tenantId?: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface RawAuthLoginResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  [key: string]: unknown;
}

/**
 * Thin HTTP client for the IdentityService auth surface.
 *
 * Endpoint paths match the backend task `auth-password-reset-backend.md`:
 *
 * - `POST /auth/verify-otp`
 * - `POST /auth/login` (password)
 * - `POST /auth/logout` and `POST /auth/logout?everywhere=true`
 * - `POST /auth/refresh-cookie` (web cookie flow)
 * - `POST /auth/forgot-password`
 * - `POST /auth/reset-password`
 * - `GET /me/sessions`
 * - `POST /me/sessions/{id}/revoke`
 *
 * Doesn't touch token storage — that's `AuthClient`'s job. Doesn't decide
 * what to do with errors — callers handle them. Just builds requests and
 * deserialises responses.
 */
export class AuthApiClient {
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly getAccessToken: (() => Promise<string | null>) | undefined;
  private readonly useCredentials: boolean;

  constructor(options: AuthApiClientOptions) {
    this.http = options.http;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getAccessToken = options.getAccessToken;
    this.useCredentials = options.useCredentials ?? false;
  }

  loginWithOtp(request: OtpLoginRequest): Promise<RawAuthLoginResponse> {
    return this.postLogin('/auth/verify-otp', request);
  }

  loginWithPassword(request: PasswordLoginRequest): Promise<RawAuthLoginResponse> {
    return this.postLogin('/auth/login', request);
  }

  /** Web cookie-flow refresh. Sends no body; cookie travels via `credentials`. */
  async refreshCookie(): Promise<RawAuthLoginResponse> {
    const response = await this.http({
      url: `${this.baseUrl}/auth/refresh-cookie`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: this.useCredentials ? 'include' : undefined,
    });
    if (!response.ok) {
      throw new Error(`refresh-cookie failed with status ${response.status}`);
    }
    return (response.data ?? {}) as RawAuthLoginResponse;
  }

  async logout(everywhere: boolean = false): Promise<void> {
    const url = everywhere ? `${this.baseUrl}/auth/logout?everywhere=true` : `${this.baseUrl}/auth/logout`;
    const response = await this.http({
      url,
      method: 'POST',
      headers: await this.authHeaders(),
      credentials: this.useCredentials ? 'include' : undefined,
    });
    if (!response.ok) {
      throw new Error(`logout failed with status ${response.status}`);
    }
  }

  async forgotPassword(request: ForgotPasswordRequest): Promise<void> {
    const response = await this.http({
      url: `${this.baseUrl}/auth/forgot-password`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    // Backend returns 200 unconditionally (no enumeration). Anything else is
    // a real failure.
    if (!response.ok) {
      throw new Error(`forgot-password failed with status ${response.status}`);
    }
  }

  async resetPassword(request: ResetPasswordRequest): Promise<void> {
    const response = await this.http({
      url: `${this.baseUrl}/auth/reset-password`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`reset-password failed with status ${response.status}`);
    }
  }

  async listSessions(): Promise<AuthSessionInfo[]> {
    const response = await this.http({
      url: `${this.baseUrl}/me/sessions`,
      method: 'GET',
      headers: await this.authHeaders(),
      credentials: this.useCredentials ? 'include' : undefined,
    });
    if (!response.ok) {
      throw new Error(`listSessions failed with status ${response.status}`);
    }
    return Array.isArray(response.data) ? (response.data as AuthSessionInfo[]) : [];
  }

  async revokeSession(sessionId: string): Promise<void> {
    const response = await this.http({
      url: `${this.baseUrl}/me/sessions/${encodeURIComponent(sessionId)}/revoke`,
      method: 'POST',
      headers: await this.authHeaders(),
      credentials: this.useCredentials ? 'include' : undefined,
    });
    if (!response.ok) {
      throw new Error(`revokeSession failed with status ${response.status}`);
    }
  }

  private async postLogin(path: string, body: object): Promise<RawAuthLoginResponse> {
    const response = await this.http({
      url: `${this.baseUrl}${path}`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: this.useCredentials ? 'include' : undefined,
    });
    if (!response.ok) {
      throw new Error(`login failed with status ${response.status}`);
    }
    return (response.data ?? {}) as RawAuthLoginResponse;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.getAccessToken === undefined) {
      return headers;
    }
    const token = await this.getAccessToken();
    if (token !== null && token !== '') {
      headers.authorization = `Bearer ${token}`;
    }
    return headers;
  }
}
