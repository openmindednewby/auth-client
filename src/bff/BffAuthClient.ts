import type { HttpClient } from '../http/HttpClient';

/**
 * Same-origin client for a per-app **Backend-For-Frontend** (`bff-katalogos`,
 * `bff-erevna`, ...). The BFF terminates authentication server-side: the
 * browser only ever holds an opaque httpOnly session cookie, never a token.
 *
 * `BffAuthClient` therefore does **no token handling at all**. Every call is a
 * same-origin `fetch` with `credentials: 'include'` so the session cookie
 * travels automatically. State-changing calls carry the `X-BFF-Csrf` header
 * the `Bff.AspNetCore` anti-forgery middleware requires.
 *
 * This is the BFF-era replacement for the direct-KC `AuthClient` / ROPC
 * adapters. It is shared so every per-app SPA wires it identically — Phase 1's
 * lesson was that copy-pasted auth adapters ship the same bug N times.
 *
 * @see `NuGetPackages/Bff.AspNetCore/README.md` — "The SPA contract".
 */

/** The `X-BFF-Csrf` header value the BFF anti-forgery middleware checks for. */
const CSRF_HEADER = 'X-BFF-Csrf';
const CSRF_HEADER_VALUE = '1';
const JSON_CONTENT_TYPE = 'application/json';

/** Endpoint paths under the BFF — all relative to the SPA's own origin. */
const ENDPOINTS = {
  login: '/bff/login',
  logout: '/bff/logout',
  me: '/bff/me',
  register: '/bff/register',
  forgotPassword: '/bff/forgot-password',
  resetPassword: '/bff/reset-password',
  otpRequest: '/bff/otp/request',
  otpVerify: '/bff/otp/verify',
  pinLogin: '/bff/pin/login',
} as const;

/** Credentials posted to `POST /bff/login`. */
export interface BffLoginRequest {
  username: string;
  password: string;
}

/** Payload for `POST /bff/register` — proxied by the BFF to TenantService. */
export interface BffRegisterRequest {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  tenantName: string;
  [key: string]: unknown;
}

/** Payload for `POST /bff/forgot-password` — proxied to TenantService. */
export interface BffForgotPasswordRequest {
  email: string;
  /** Full URL with a `{token}` placeholder; the backend substitutes the token. */
  resetUrlTemplate?: string;
  [key: string]: unknown;
}

/** Payload for `POST /bff/reset-password` — proxied to TenantService. */
export interface BffResetPasswordRequest {
  token: string;
  newPassword: string;
}

/**
 * Payload for `POST /bff/otp/request` — the BFF proxies it to TenantService,
 * which generates a short-TTL code and emails it.
 */
export interface BffOtpRequestRequest {
  /** The email address (or username) the one-time code is sent to. */
  identifier: string;
}

/** Payload for `POST /bff/otp/verify` — the BFF exchanges it for a session. */
export interface BffOtpVerifyRequest {
  /** The email / username the code was requested for. */
  username: string;
  /** The one-time code the user entered. */
  otp: string;
}

/**
 * Payload for `POST /bff/pin/login` — the BFF exchanges an event-scoped PIN
 * for a session.
 *
 * The `(event, pin)` pair alone identifies the staff member: no `username` /
 * `password` ever leaves the browser. A PIN entered in an event's context
 * grants that staff member their event-scoped role for that event only
 * (the unified-auth plan §4.4 — event-scoped, per-individual PINs).
 */
export interface BffPinLoginRequest {
  /** The numeric PIN the staff member entered. */
  pin: string;
  /** External id of the event the PIN is scoped to (supplied by the page/route). */
  eventExternalId: string;
}

/**
 * The body `POST /bff/otp/request` relays from TenantService.
 *
 * Anti-enumeration: the shape is identical whether or not the identifier is
 * registered. `code` is non-null only outside production (a dev convenience);
 * the UI must never depend on it being present.
 */
export interface BffOtpRequestResult {
  /** Always `true` on a relayed 200 — the request was accepted. */
  success: boolean;
  /** Seconds until the emitted code expires — drives a countdown in the UI. */
  expiresIn: number;
  /** The code itself, non-production only; `null` (or absent) in production. */
  code: string | null;
}

/**
 * The user object returned by `GET /bff/me` and `POST /bff/login`. The BFF
 * returns the sanitised KC claims under a `user` envelope and **never** a
 * token. Kept permissive so server-added claims flow through without a bump.
 */
export interface BffUser {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  tenantId?: string;
  roles?: string[];
  [key: string]: unknown;
}

/** Envelope shape the BFF auth endpoints respond with: `{ user: {...} }`. */
interface BffUserEnvelope {
  user?: BffUser;
}

export interface BffAuthClientOptions {
  /** Runtime-agnostic HTTP transport (wrap native `fetch` with `createFetchHttpClient`). */
  http: HttpClient;
  /**
   * BFF origin. Defaults to `''` (same-origin) — the production wiring. An
   * explicit origin is only useful for tests or a non-same-origin BFF.
   */
  baseUrl?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Pull the `user` object out of a `{ user: {...} }` envelope, or `null`. */
function extractUser(data: unknown): BffUser | null {
  if (!isRecord(data)) {
    return null;
  }
  const envelope = data as BffUserEnvelope;
  return isRecord(envelope.user) ? envelope.user : null;
}

/**
 * Normalise the `POST /bff/otp/request` response body into a `BffOtpRequestResult`.
 *
 * The endpoint is anti-enumeration — the body shape is fixed — but it is read
 * defensively so a missing / malformed field degrades gracefully rather than
 * throwing: `success` defaults to `true` (a relayed 200 means accepted),
 * `expiresIn` to `0`, `code` to `null`.
 */
function toOtpRequestResult(data: unknown): BffOtpRequestResult {
  if (!isRecord(data)) {
    return { success: true, expiresIn: 0, code: null };
  }
  return {
    success: typeof data.success === 'boolean' ? data.success : true,
    expiresIn: typeof data.expiresIn === 'number' ? data.expiresIn : 0,
    code: typeof data.code === 'string' ? data.code : null,
  };
}

/**
 * Same-origin client for a per-app BFF.
 *
 * No token storage, no refresh logic, no realm awareness — the BFF owns all of
 * that server-side. The browser's only auth artefact is the httpOnly cookie.
 */
export class BffAuthClient {
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(options: BffAuthClientOptions) {
    this.http = options.http;
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
  }

  /**
   * `POST /bff/login` — the BFF does ROPC against Keycloak server-side, stores
   * the tokens in its Redis vault, and sets the httpOnly session cookie.
   * Returns the sanitised user. Throws on a non-2xx response.
   */
  async login(request: BffLoginRequest): Promise<BffUser> {
    const data = await this.postState(ENDPOINTS.login, request, 'login');
    const user = extractUser(data);
    if (user === null) {
      throw new Error('login: BFF response missing user');
    }
    return user;
  }

  /**
   * `POST /bff/logout` — the BFF calls KC end-session, deletes the Redis
   * session, and clears the cookie. Non-fatal: a failed logout still leaves
   * the SPA logged out client-side. Throws only on a non-2xx response.
   */
  async logout(): Promise<void> {
    await this.postState(ENDPOINTS.logout, undefined, 'logout');
  }

  /**
   * `GET /bff/me` — the live session's sanitised user, or `null` when there is
   * no session (the BFF answers `401`). Used at app load to bootstrap auth
   * state in place of the old token-in-storage check.
   */
  async getCurrentUser(): Promise<BffUser | null> {
    const response = await this.http({
      url: `${this.baseUrl}${ENDPOINTS.me}`,
      method: 'GET',
      headers: { Accept: JSON_CONTENT_TYPE },
      credentials: 'include',
    });
    if (!response.ok) {
      return null;
    }
    return extractUser(response.data);
  }

  /**
   * `POST /bff/register` — the BFF proxies registration to TenantService and,
   * on success, establishes a session exactly like `login`. Returns the user.
   */
  async register(request: BffRegisterRequest): Promise<BffUser> {
    const data = await this.postState(ENDPOINTS.register, request, 'register');
    const user = extractUser(data);
    if (user === null) {
      throw new Error('register: BFF response missing user');
    }
    return user;
  }

  /**
   * `POST /bff/forgot-password` — proxied to TenantService. The backend
   * returns 200 unconditionally (no email enumeration); anything else throws.
   */
  async forgotPassword(request: BffForgotPasswordRequest): Promise<void> {
    await this.postState(ENDPOINTS.forgotPassword, request, 'forgot-password');
  }

  /**
   * `POST /bff/reset-password` — proxied to TenantService. Throws on a non-2xx
   * response (e.g. `400` for an invalid / expired token).
   */
  async resetPassword(request: BffResetPasswordRequest): Promise<void> {
    await this.postState(ENDPOINTS.resetPassword, request, 'reset-password');
  }

  /**
   * `POST /bff/otp/request` — the BFF proxies to TenantService, which generates
   * a short-TTL code and emails it.
   *
   * The endpoint is anti-enumeration: a `200` is the normal path whether or not
   * the identifier is registered. This method therefore **returns** the relayed
   * `{ success, expiresIn, code }` body (so the UI can show the expiry) rather
   * than treating a 200 as opaque. It still throws on a non-2xx — a `501`
   * (OTP not enabled) or `502` (upstream down) is a real failure to surface.
   */
  async requestOtp(request: BffOtpRequestRequest): Promise<BffOtpRequestResult> {
    const data = await this.postState(ENDPOINTS.otpRequest, request, 'otp-request');
    return toOtpRequestResult(data);
  }

  /**
   * `POST /bff/otp/verify` — the BFF runs the OTP direct-grant against Keycloak
   * server-side, stores the tokens in its Redis vault, and sets the httpOnly
   * session cookie. Returns the sanitised user, exactly like `login`. Throws on
   * a non-2xx (e.g. `401` for a bad / expired code).
   */
  async verifyOtp(request: BffOtpVerifyRequest): Promise<BffUser> {
    const data = await this.postState(ENDPOINTS.otpVerify, request, 'otp-verify');
    const user = extractUser(data);
    if (user === null) {
      throw new Error('otp-verify: BFF response missing user');
    }
    return user;
  }

  /**
   * `POST /bff/pin/login` — the BFF runs the event-scoped PIN direct-grant
   * against Keycloak server-side (the `(event, pin)` pair resolves to the
   * staff member's KC account + event-scoped role), stores the tokens in its
   * Redis vault, and sets the httpOnly session cookie. Returns the sanitised
   * user, exactly like `login` / `verifyOtp`. Throws on a non-2xx — `401` for
   * a bad / expired / locked-out PIN or an unknown event, `501` when PIN login
   * is not an enabled method for this BFF.
   */
  async pinLogin(request: BffPinLoginRequest): Promise<BffUser> {
    const data = await this.postState(ENDPOINTS.pinLogin, request, 'pin-login');
    const user = extractUser(data);
    if (user === null) {
      throw new Error('pin-login: BFF response missing user');
    }
    return user;
  }

  /**
   * Shared POST for every state-changing `/bff/*` call: same-origin, cookie
   * included, `X-BFF-Csrf` header attached. Throws a labelled error on non-2xx.
   */
  private async postState(path: string, body: object | undefined, label: string): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': JSON_CONTENT_TYPE,
      Accept: JSON_CONTENT_TYPE,
      [CSRF_HEADER]: CSRF_HEADER_VALUE,
    };
    const response = await this.http({
      url: `${this.baseUrl}${path}`,
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`${label} failed with status ${String(response.status)}`);
    }
    return response.data;
  }
}
