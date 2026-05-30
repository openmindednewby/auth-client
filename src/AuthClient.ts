import {
  buildAuthorizationEndpoint,
  buildAuthorizationUrl,
  buildIssuerUrl,
  buildLogoutEndpoint,
  buildTokenEndpoint,
  buildUserInfoEndpoint,
} from './utils/buildKeycloakUrls';
import { isTokenExpired } from './utils/isTokenExpired';
import { parseBaseUrlFromIssuer, parseRealmFromIssuer } from './utils/parseRealmFromIssuer';
import { normalizeTokenResponse, tokenResponseToAuthTokens } from './utils/normalizeTokenResponse';
import { AuthEventEmitter, type AuthEventListener, type AuthEventName, type AuthEventUnsubscribe } from './events/AuthEventEmitter';

import type { AuthApiClient, RawAuthLoginResponse } from './api/AuthApiClient';
import type { AuthClientConfig } from './types/AuthClientConfig';
import type { AuthTokens } from './types/AuthTokens';
import type { TokenStorage } from './types/TokenStorage';
import type { InactivityTracker } from './inactivity/InactivityTracker';
import type { RefreshInterceptor } from './interceptor/RefreshInterceptor';
import type { TokenResponse } from './types/TokenResponse';

const DEFAULT_SCOPE = 'openid profile email';
const OFFLINE_ACCESS_SCOPE = 'offline_access';

/**
 * Inputs to {@link AuthClient.fromIssuerUrl}.
 *
 * Used by consumers that store only an issuer URL and want to derive `realm`
 * + `baseUrl` rather than configure them separately.
 */
export interface AuthClientFromIssuerInput {
  issuerUrl: string;
  clientId: string;
  redirectUri?: string;
  scope?: string;
}

/**
 * Optional collaborators wired into {@link AuthClient} for the v2 surface.
 *
 * - `api` enables `loginWith*`, `logout`, `requestPasswordReset`,
 *   `confirmPasswordReset`. Without it, those methods throw.
 * - `interceptor` enables `init()` to silently refresh tokens at boot, and is
 *   used by `loginWithOtp/Password` to mark inactivity-active.
 * - `inactivityTracker` enforces the 90-day timeout at `init()`.
 *
 * Consumers can omit any/all of these — the v1 PKCE / token-storage surface
 * keeps working unchanged.
 */
export interface AuthClientCollaborators {
  api?: AuthApiClient;
  interceptor?: RefreshInterceptor;
  inactivityTracker?: InactivityTracker;
  events?: AuthEventEmitter;
  /**
   * Observability hook fired when a fresh token bundle has been acquired
   * (any login path: OTP, password, or direct-KC PKCE). For app-side
   * analytics/logging only — NOT for BFF integration (Phase 2 designs that
   * fresh).
   */
  onTokenAcquired?: (tokens: AuthTokens) => void;
  /**
   * Observability hook fired when an existing token bundle has been
   * refreshed. For app-side analytics/logging only.
   */
  onTokenRefreshed?: (tokens: AuthTokens) => void;
}

/**
 * Direct-to-KC (PKCE) routing flag added in v2.1.0.
 *
 * When `true`, `AuthClient` consumers can route their PKCE auth code through
 * the shared OIDC primitives (`exchangeAuthorizationCodeViaOidc`,
 * `refreshTokensViaOidc`) instead of the proxied identity-api `/auth/login`
 * + `/auth/refresh` flow.
 *
 * Default `false` — v2.0 behavior unchanged.
 *
 * The flag is read-only at runtime (`isDirectMode()`) so apps can render
 * conditionally on whether they've opted in.
 */
export interface DirectKcOptions {
  useDirectKcAuth?: boolean;
}

export interface LoginOptions {
  /** When true, request `offline_access` scope so the IdP issues a long-lived refresh token. */
  offlineAccess?: boolean;
}

export interface LogoutOptions {
  /** Revoke all sessions on the IdP, not just the current one. */
  everywhere?: boolean;
}

export class AuthClient {
  private readonly config: AuthClientConfig;
  private readonly directKcAuth: boolean;
  private readonly tokenStorage: TokenStorage;
  private readonly api: AuthApiClient | undefined;
  private readonly interceptor: RefreshInterceptor | undefined;
  private readonly inactivityTracker: InactivityTracker | undefined;
  private readonly events: AuthEventEmitter;
  private readonly onTokenAcquired: ((tokens: AuthTokens) => void) | undefined;
  private readonly onTokenRefreshed: ((tokens: AuthTokens) => void) | undefined;

  /**
   * @throws Error when `baseUrl`, `realm`, or `clientId` is missing or empty.
   */
  constructor(
    config: AuthClientConfig & DirectKcOptions,
    storage: TokenStorage,
    collaborators: AuthClientCollaborators = {},
  ) {
    AuthClient.validateConfig(config);
    this.config = {
      ...config,
      scope: config.scope ?? DEFAULT_SCOPE,
    };
    this.directKcAuth = config.useDirectKcAuth === true;
    this.tokenStorage = storage;
    this.api = collaborators.api;
    this.interceptor = collaborators.interceptor;
    this.inactivityTracker = collaborators.inactivityTracker;
    this.events = collaborators.events ?? new AuthEventEmitter();
    this.onTokenAcquired = collaborators.onTokenAcquired;
    this.onTokenRefreshed = collaborators.onTokenRefreshed;
  }

  /**
   * Whether this client is configured to route auth flows directly to
   * Keycloak (v2.1.0 direct-KC path) instead of through the proxied
   * identity-api `/auth/*` endpoints.
   *
   * Apps can render conditionally on this — e.g. to swap a login form for
   * a "Sign in with Keycloak" redirect button.
   */
  isDirectMode(): boolean {
    return this.directKcAuth;
  }

  /**
   * Persist a token bundle produced by an external flow (e.g. the
   * app-side `useKeycloakExchange` hook that consumes the shared
   * `exchangeAuthorizationCode` primitive). Fires `onTokenAcquired` after
   * persistence and marks the inactivity tracker active.
   *
   * Designed for the v2.1.0 direct-KC path where the PKCE code exchange
   * happens in the app's React-Query hook (which needs `useDispatch`/etc.)
   * but the token persistence + observability should still flow through
   * the shared client.
   */
  async acceptDirectKcTokens(response: TokenResponse): Promise<AuthTokens> {
    const tokens = tokenResponseToAuthTokens(response);
    await this.tokenStorage.write(tokens);
    if (this.inactivityTracker !== undefined) {
      await this.inactivityTracker.markActive();
    }
    if (this.onTokenAcquired !== undefined) {
      this.onTokenAcquired(tokens);
    }
    return tokens;
  }

  /**
   * Same as {@link acceptDirectKcTokens} but fires `onTokenRefreshed`.
   * Use after a `refreshAccessToken()` swap to keep observability counts
   * separated between "fresh login" and "silent refresh".
   */
  async acceptDirectKcRefresh(response: TokenResponse): Promise<AuthTokens> {
    const tokens = tokenResponseToAuthTokens(response);
    await this.tokenStorage.write(tokens);
    if (this.inactivityTracker !== undefined) {
      await this.inactivityTracker.markActive();
    }
    if (this.onTokenRefreshed !== undefined) {
      this.onTokenRefreshed(tokens);
    }
    return tokens;
  }

  /**
   * Build an {@link AuthClient} from a standalone issuer URL by parsing the
   * realm and base URL. Useful when migrating from the legacy
   * `KEYCLOAK_ISSUER` env var convention.
   *
   * @throws Error when the issuer URL doesn't match `{base}/realms/{realm}`.
   */
  static fromIssuerUrl(
    input: AuthClientFromIssuerInput,
    storage: TokenStorage,
    collaborators: AuthClientCollaborators = {},
  ): AuthClient {
    const realm = parseRealmFromIssuer(input.issuerUrl);
    const baseUrl = parseBaseUrlFromIssuer(input.issuerUrl);
    if (realm === null || baseUrl === null || baseUrl === '') {
      throw new Error(`AuthClient.fromIssuerUrl: cannot parse realm from "${input.issuerUrl}"`);
    }
    return new AuthClient(
      {
        baseUrl,
        realm,
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        scope: input.scope,
      },
      storage,
      collaborators,
    );
  }

  private static validateConfig(config: AuthClientConfig): void {
    if (typeof config.baseUrl !== 'string' || config.baseUrl === '') {
      throw new Error('AuthClient: baseUrl is required');
    }
    if (typeof config.realm !== 'string' || config.realm === '') {
      throw new Error('AuthClient: realm is required');
    }
    if (typeof config.clientId !== 'string' || config.clientId === '') {
      throw new Error('AuthClient: clientId is required');
    }
  }

  get realm(): string {
    return this.config.realm;
  }

  get clientId(): string {
    return this.config.clientId;
  }

  get baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, '');
  }

  get scope(): string {
    // Constructor always materialises a scope (either user-supplied or DEFAULT_SCOPE).
    return this.config.scope as string;
  }

  get redirectUri(): string | undefined {
    return this.config.redirectUri;
  }

  /** Issuer URL: `{baseUrl}/realms/{realm}`. */
  get issuerUrl(): string {
    return buildIssuerUrl(this.baseUrl, this.realm);
  }

  get authorizationEndpoint(): string {
    return buildAuthorizationEndpoint(this.baseUrl, this.realm);
  }

  get tokenEndpoint(): string {
    return buildTokenEndpoint(this.baseUrl, this.realm);
  }

  get userInfoEndpoint(): string {
    return buildUserInfoEndpoint(this.baseUrl, this.realm);
  }

  get logoutEndpoint(): string {
    return buildLogoutEndpoint(this.baseUrl, this.realm);
  }

  /**
   * Build a fully-formed authorization URL the user agent can navigate to.
   *
   * @throws Error when `redirectUri` is not configured.
   */
  buildAuthorizationUrl(input: {
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: 'S256' | 'plain';
    offlineAccess?: boolean;
  } = {}): string {
    if (typeof this.config.redirectUri !== 'string' || this.config.redirectUri === '') {
      throw new Error('AuthClient.buildAuthorizationUrl: redirectUri is required');
    }
    return buildAuthorizationUrl({
      baseUrl: this.baseUrl,
      realm: this.realm,
      clientId: this.clientId,
      redirectUri: this.config.redirectUri,
      scope: this.resolveScope(input.offlineAccess),
      state: input.state,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
    });
  }

  async getTokens(): Promise<AuthTokens | null> {
    return this.tokenStorage.read();
  }

  async setTokens(tokens: AuthTokens): Promise<void> {
    return this.tokenStorage.write(tokens);
  }

  async clearTokens(): Promise<void> {
    return this.tokenStorage.clear();
  }

  /**
   * Read the current access token if it exists and is not expired.
   * Returns `null` for "no usable token".
   */
  async getAccessToken(now: number = Date.now()): Promise<string | null> {
    const tokens = await this.tokenStorage.read();
    if (tokens === null) {
      return null;
    }
    if (isTokenExpired(tokens, undefined, now)) {
      return null;
    }
    return tokens.accessToken;
  }

  /** Subscribe to lifecycle events (currently `sessionExpired` only). */
  on(event: AuthEventName, listener: AuthEventListener): AuthEventUnsubscribe {
    return this.events.on(event, listener);
  }

  /**
   * Boot-time wiring. Checks the inactivity tracker; if expired, clears
   * tokens and emits `sessionExpired`. Returns whether a usable session
   * survived.
   */
  async init(): Promise<{ hasSession: boolean }> {
    if (this.inactivityTracker !== undefined) {
      const expired = await this.inactivityTracker.isExpired();
      if (expired) {
        await this.tokenStorage.clear();
        await this.inactivityTracker.clear();
        this.events.emit('sessionExpired');
        return { hasSession: false };
      }
    }
    const tokens = await this.tokenStorage.read();
    return { hasSession: tokens !== null };
  }

  /**
   * Trigger a refresh via the configured interceptor. Returns the new tokens
   * or `null` when the refresh failed (in which case `sessionExpired` has
   * already fired).
   *
   * @throws Error when no interceptor is configured.
   */
  async refresh(): Promise<AuthTokens | null> {
    if (this.interceptor === undefined) {
      throw new Error('AuthClient.refresh: no RefreshInterceptor configured');
    }
    const tokens = await this.interceptor.refreshTokens();
    if (tokens !== null && this.onTokenRefreshed !== undefined) {
      this.onTokenRefreshed(tokens);
    }
    return tokens;
  }

  async loginWithOtp(input: { email: string; otp: string; tenantId?: string } & LoginOptions): Promise<AuthTokens> {
    return this.runLogin(this.requireApi().loginWithOtp({
      email: input.email,
      otp: input.otp,
      tenantId: input.tenantId,
      offlineAccess: input.offlineAccess ?? false,
    }));
  }

  async loginWithPassword(
    input: { email: string; password: string; tenantId?: string } & LoginOptions,
  ): Promise<AuthTokens> {
    return this.runLogin(this.requireApi().loginWithPassword({
      email: input.email,
      password: input.password,
      tenantId: input.tenantId,
      offlineAccess: input.offlineAccess ?? false,
    }));
  }

  async logout(options: LogoutOptions = {}): Promise<void> {
    const api = this.requireApi();
    try {
      await api.logout(options.everywhere ?? false);
    } finally {
      await this.tokenStorage.clear();
      if (this.inactivityTracker !== undefined) {
        await this.inactivityTracker.clear();
      }
    }
  }

  async requestPasswordReset(input: { email: string; tenantId?: string }): Promise<void> {
    return this.requireApi().forgotPassword({ email: input.email, tenantId: input.tenantId });
  }

  async confirmPasswordReset(input: { token: string; newPassword: string }): Promise<void> {
    return this.requireApi().resetPassword({ token: input.token, newPassword: input.newPassword });
  }

  /** Internal: run a login HTTP call, persist tokens, mark inactivity-active. */
  private async runLogin(promise: Promise<RawAuthLoginResponse>): Promise<AuthTokens> {
    const raw = await promise;
    if (typeof raw.access_token !== 'string' || raw.access_token === '') {
      throw new Error('AuthClient: login response missing access_token');
    }
    // After the guard above, raw.access_token is `string`; widen the optional-shaped
    // RawAuthLoginResponse into the strict RawTokenResponse the normaliser expects.
    const normalized = normalizeTokenResponse({ ...raw, access_token: raw.access_token });
    const tokens = tokenResponseToAuthTokens(normalized);
    await this.tokenStorage.write(tokens);
    if (this.inactivityTracker !== undefined) {
      await this.inactivityTracker.markActive();
    }
    if (this.onTokenAcquired !== undefined) {
      this.onTokenAcquired(tokens);
    }
    return tokens;
  }

  private requireApi(): AuthApiClient {
    if (this.api === undefined) {
      throw new Error('AuthClient: no AuthApiClient configured');
    }
    return this.api;
  }

  private resolveScope(offlineAccess?: boolean): string {
    if (offlineAccess !== true) {
      return this.scope;
    }
    if (this.scope.includes(OFFLINE_ACCESS_SCOPE)) {
      return this.scope;
    }
    return `${this.scope} ${OFFLINE_ACCESS_SCOPE}`.trim();
  }
}
