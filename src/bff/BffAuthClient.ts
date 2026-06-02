import type { HttpClient, HttpResponse } from '../http/HttpClient';

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
  config: '/bff/config',
  pinEnroll: '/bff/pin/enroll',
  pinUnlock: '/bff/pin/unlock',
  pinDisable: '/bff/pin/disable',
} as const;

/** HTTP statuses the device-PIN flow routes on. */
const HTTP_OK = 200;
const HTTP_MULTIPLE_CHOICES = 300;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;

/** The lowercase login methods `GET /bff/config` advertises (`Bff:Methods:Default`). */
const FALLBACK_METHODS: readonly string[] = ['password'];

/** The PIN lengths the BFF accepts on enrol (`digits` ∈ {4, 6, 8}). */
const ALLOWED_PIN_DIGITS: readonly number[] = [4, 6, 8];

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

/** Payload for `POST /bff/pin/enroll` — bind a device PIN to the current session. */
export interface BffDevicePinEnrollRequest {
  /** The numeric PIN the user chose. */
  pin: string;
  /** The chosen PIN length (must be one of 4 / 6 / 8). */
  digits: number;
}

/** Payload for `POST /bff/pin/unlock` — re-establish a session from a remembered device. */
export interface BffDevicePinUnlockRequest {
  /** The numeric device PIN the returning user entered. */
  pin: string;
}

/**
 * The optional per-device state half of `GET /bff/config`, all fields safe-defaulted.
 *
 * Read off the BFF's per-device record (keyed by the device cookie). Older BFFs /
 * tests omit the fields entirely, in which case the PIN-unlock gate simply never
 * triggers (`hasPin` defaults to `false`, `rememberedUsername` to `null`).
 */
export interface BffDeviceState {
  /** Non-secret username this device remembers, or `null` when none. */
  rememberedUsername: string | null;
  /** `true` when this device has an enrolled device PIN. */
  hasPin: boolean;
  /** The enrolled PIN length (4 / 6 / 8), or `null` when unknown / no PIN. */
  pinDigits: number | null;
  /** The device-local preferred-method hint (e.g. `"pin"`), or `null`. */
  preferredMethod: string | null;
}

/**
 * The parsed `GET /bff/config` response: which login methods this BFF advertises,
 * whether self-serve registration is enabled, and the optional per-device state.
 *
 * `methods` are the lowercase strings the server-side `BffLoginMethod` enum
 * serialises to (`"password"` | `"otp"` | `"pin"` | `"passkey"`), de-duplicated
 * and order-preserving. On a network failure or malformed body the client returns
 * a safe fallback (`["password"]`, registration off, empty device-state).
 */
export interface BffLoginConfig {
  /** The enabled login methods, lowercase, in the order the BFF advertised them. */
  methods: string[];
  /** `true` when this BFF exposes self-serve registration. */
  registrationEnabled: boolean;
  /** The optional per-device state (remembered username + device PIN), safe-defaulted. */
  deviceState: BffDeviceState;
}

/**
 * Discriminated result of `unlockWithDevicePin`. Never rejects — the unlock UI
 * routes on `status` (the published `login`/`pinLogin` throw an opaque error on
 * any non-2xx, collapsing 401 vs 429; this is why the device-PIN flow needs its
 * own client surface).
 *
 * The two `429` outcomes are distinct and MUST stay distinct: the BFF's per-IP
 * `BffAuth` sliding-window limiter answers `429` with an EMPTY body
 * (`rateLimited` — the UI may poll through it), whereas the device-PIN lockout
 * answers `429` with a JSON `{ error }` body + a `Retry-After` header (`locked` —
 * the UI shows a "try again in N s" message).
 */
export type DevicePinUnlockResult =
  | { status: 'success'; user: BffUser }
  | { status: 'invalid' }
  | { status: 'locked'; retryAfterSeconds: number | null }
  | { status: 'rateLimited'; retryAfterSeconds: number | null }
  | { status: 'error' };

/**
 * Discriminated result of `enrollDevicePin`. Never rejects — the enrol form routes
 * on `status`:
 *  - `success`      — HTTP 200, the device PIN is bound to the current session;
 *  - `unauthorized` — HTTP 401, no session to bind to;
 *  - `forbidden`    — HTTP 403, a PIN-established session can't enrol a new PIN;
 *  - `invalidPin`   — HTTP 400, the PIN format was rejected;
 *  - `error`        — anything else (501 disabled / 502 grant failed / network).
 */
export type DevicePinEnrollResult =
  | { status: 'success' }
  | { status: 'unauthorized' }
  | { status: 'forbidden' }
  | { status: 'invalidPin' }
  | { status: 'error' };

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

/** The safe fallback returned by `getLoginConfig` on any failure. */
const FALLBACK_LOGIN_CONFIG: BffLoginConfig = {
  methods: [...FALLBACK_METHODS],
  registrationEnabled: false,
  deviceState: {
    rememberedUsername: null,
    hasPin: false,
    pinDigits: null,
    preferredMethod: null,
  },
};

/** Read an optional non-empty string field off a record, else `null`. */
function readOptionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  return value;
}

/** Parse the optional device-state fields off `/bff/config` (graceful defaults). */
function parseDeviceState(body: Record<string, unknown>): BffDeviceState {
  const rawDigits = body.pinDigits;
  const hasValidDigits = typeof rawDigits === 'number' && ALLOWED_PIN_DIGITS.includes(rawDigits);
  return {
    rememberedUsername: readOptionalString(body, 'rememberedUsername'),
    hasPin: body.hasPin === true,
    pinDigits: hasValidDigits ? rawDigits : null,
    preferredMethod: readOptionalString(body, 'preferredMethod'),
  };
}

/** Normalise the `methods` array to lowercase strings, de-duplicated, fallback when empty. */
function parseMethods(body: Record<string, unknown>): string[] {
  const raw = body.methods;
  if (!Array.isArray(raw)) {
    return [...FALLBACK_METHODS];
  }
  const parsed = raw
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .map((value) => value.toLowerCase());
  return parsed.length === 0 ? [...FALLBACK_METHODS] : Array.from(new Set(parsed));
}

/** Parse a full `GET /bff/config` body into a `BffLoginConfig`, falling back defensively. */
function parseLoginConfig(data: unknown): BffLoginConfig {
  if (!isRecord(data)) {
    return FALLBACK_LOGIN_CONFIG;
  }
  return {
    methods: parseMethods(data),
    registrationEnabled: data.registrationEnabled === true,
    deviceState: parseDeviceState(data),
  };
}

/**
 * Parse a `Retry-After` header value (delta-seconds form) into a non-negative
 * integer, or `null` when absent / unparseable.
 */
function parseRetryAfter(response: HttpResponse): number | null {
  const raw = response.header?.('Retry-After');
  if (raw === null || raw === undefined) {
    return null;
  }
  const seconds = Number.parseInt(raw, 10);
  if (Number.isNaN(seconds) || seconds < 0) {
    return null;
  }
  return seconds;
}

/** Map a `429` unlock response to `locked` (JSON body) or `rateLimited` (empty body). */
function classifyTooManyRequests(response: HttpResponse): DevicePinUnlockResult {
  const retryAfterSeconds = parseRetryAfter(response);
  // The per-IP limiter answers 429 with an EMPTY body (data undefined); the
  // device-PIN lockout answers 429 with a JSON `{ error }` body (data is a record).
  if (isRecord(response.data)) {
    return { status: 'locked', retryAfterSeconds };
  }
  return { status: 'rateLimited', retryAfterSeconds };
}

/** Map a non-success enrol status to its discriminated result. */
function classifyEnrollFailure(status: number): DevicePinEnrollResult {
  if (status === HTTP_UNAUTHORIZED) {
    return { status: 'unauthorized' };
  }
  if (status === HTTP_FORBIDDEN) {
    return { status: 'forbidden' };
  }
  if (status === HTTP_BAD_REQUEST) {
    return { status: 'invalidPin' };
  }
  return { status: 'error' };
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
   * `GET /bff/config` — which login methods this BFF advertises, whether
   * registration is enabled, and the optional per-device state (remembered
   * username + device PIN). Unauthenticated, no CSRF (GET).
   *
   * NEVER throws: on a non-2xx, a network error, or a malformed body it returns
   * a safe fallback (`{ methods: ['password'], registrationEnabled: false,
   * deviceState: { rememberedUsername: null, hasPin: false, pinDigits: null,
   * preferredMethod: null } }`) so the login surface stays usable even when the
   * config endpoint is unreachable.
   */
  async getLoginConfig(): Promise<BffLoginConfig> {
    try {
      const response = await this.http({
        url: `${this.baseUrl}${ENDPOINTS.config}`,
        method: 'GET',
        headers: { Accept: JSON_CONTENT_TYPE },
        credentials: 'include',
      });
      if (!response.ok) {
        return FALLBACK_LOGIN_CONFIG;
      }
      return parseLoginConfig(response.data);
    } catch {
      return FALLBACK_LOGIN_CONFIG;
    }
  }

  /**
   * `POST /bff/pin/enroll` — bind a device PIN to the CURRENT strong session.
   * Requires an authenticated session (the cookie travels via
   * `credentials: 'include'`); the BFF requests an offline token, hashes the
   * PIN, and sets the device cookie.
   *
   * NEVER throws — resolves a discriminated {@link DevicePinEnrollResult}:
   *  - 200 → `success`;
   *  - 401 → `unauthorized` (no session);
   *  - 403 → `forbidden` (a PIN-established session can't enrol);
   *  - 400 → `invalidPin` (bad format);
   *  - anything else (501 disabled / 502 grant failed) / network → `error`.
   */
  async enrollDevicePin(request: BffDevicePinEnrollRequest): Promise<DevicePinEnrollResult> {
    try {
      const response = await this.postRaw(ENDPOINTS.pinEnroll, request);
      if (response.ok) {
        return { status: 'success' };
      }
      return classifyEnrollFailure(response.status);
    } catch {
      return { status: 'error' };
    }
  }

  /**
   * `POST /bff/pin/unlock` — re-establish a session from a remembered device.
   * No prior session; the device cookie travels via `credentials: 'include'`.
   *
   * NEVER throws — resolves a discriminated {@link DevicePinUnlockResult}:
   *  - 200 + `{ user }` → `success` (a session cookie was set);
   *  - 401             → `invalid` (wrong PIN / unknown-or-revoked device);
   *  - 429 + JSON body → `locked` (device lockout; `Retry-After` parsed);
   *  - 429 + empty body → `rateLimited` (per-IP limiter; `Retry-After` parsed);
   *  - anything else / malformed 200 body / network → `error`.
   */
  async unlockWithDevicePin(request: BffDevicePinUnlockRequest): Promise<DevicePinUnlockResult> {
    try {
      const response = await this.postRaw(ENDPOINTS.pinUnlock, request);
      const isSuccess = response.status >= HTTP_OK && response.status < HTTP_MULTIPLE_CHOICES;
      if (isSuccess) {
        const user = extractUser(response.data);
        return user === null ? { status: 'error' } : { status: 'success', user };
      }
      if (response.status === HTTP_UNAUTHORIZED) {
        return { status: 'invalid' };
      }
      if (response.status === HTTP_TOO_MANY_REQUESTS) {
        return classifyTooManyRequests(response);
      }
      return { status: 'error' };
    } catch {
      return { status: 'error' };
    }
  }

  /**
   * `POST /bff/pin/disable` — drop the device PIN for the CURRENT session. The
   * BFF revokes the offline token at Keycloak, deletes the device record, and
   * clears the device cookie. Requires an authenticated session.
   *
   * NEVER throws — resolves `true` on a 2xx, `false` on anything else.
   */
  async disableDevicePin(): Promise<boolean> {
    try {
      const response = await this.postRaw(ENDPOINTS.pinDisable, undefined);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Shared POST for the never-throw device-PIN calls: same-origin, cookie
   * included, `X-BFF-Csrf` header attached. Returns the raw {@link HttpResponse}
   * (status + body + headers) so the caller can route on it instead of throwing.
   */
  private postRaw(path: string, body: object | undefined): Promise<HttpResponse> {
    const headers: Record<string, string> = {
      'Content-Type': JSON_CONTENT_TYPE,
      Accept: JSON_CONTENT_TYPE,
      [CSRF_HEADER]: CSRF_HEADER_VALUE,
    };
    return this.http({
      url: `${this.baseUrl}${path}`,
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
    });
  }

  /**
   * Shared POST for every state-changing `/bff/*` call: same-origin, cookie
   * included, `X-BFF-Csrf` header attached. Throws a labelled error on non-2xx.
   */
  private async postState(path: string, body: object | undefined, label: string): Promise<unknown> {
    const response = await this.postRaw(path, body);
    if (!response.ok) {
      throw new Error(`${label} failed with status ${String(response.status)}`);
    }
    return response.data;
  }
}
