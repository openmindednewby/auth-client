# Changelog

## 3.2.0 (2026-05-22)

Additive release for Phase 3d of the unified-auth plan — event-scoped PIN
login. Extends `BffAuthClient` with the browser-facing PIN call so the new
`<PinForm>` in `@dloizides/auth-web` has a same-origin client. No breaking
changes.

### Added

- `BffAuthClient.pinLogin({ pin, eventExternalId })` → `POST /bff/pin/login`.
  The BFF runs the event-scoped PIN direct-grant against Keycloak server-side
  (the `(event, pin)` pair resolves to the staff member's KC account + their
  event-scoped role) and sets the httpOnly session cookie. Returns the
  sanitised `BffUser`, exactly like `login` / `verifyOtp`. Throws on a non-2xx
  (`401` for a bad / expired / locked-out PIN or an unknown event, `501` when
  PIN login is not an enabled method). Carries the `X-BFF-Csrf` header like
  every other state-changing call. No `username` / `password` ever leaves the
  browser.
- Type: `BffPinLoginRequest`.

## 3.1.0 (2026-05-22)

Additive release for Phase 2d of the unified-auth plan — email-OTP. Extends
`BffAuthClient` with the two browser-facing OTP calls so the new `<OtpForm>` in
`@dloizides/auth-web` has a same-origin client. No breaking changes.

### Added

- `BffAuthClient.requestOtp({ identifier })` → `POST /bff/otp/request`. The BFF
  proxies to TenantService, which emails a short-TTL code. The endpoint is
  anti-enumeration (a `200` is the normal path), so the method **returns** the
  relayed `{ success, expiresIn, code }` body — the UI uses `expiresIn` for a
  countdown. It still throws on a non-2xx (`501` OTP not enabled, `502` upstream
  down). Carries the `X-BFF-Csrf` header like every other state-changing call.
- `BffAuthClient.verifyOtp({ username, otp })` → `POST /bff/otp/verify`. The BFF
  runs the OTP direct-grant against Keycloak server-side and sets the httpOnly
  session cookie. Returns the sanitised `BffUser`, exactly like `login`. Throws
  on a non-2xx (e.g. `401` for a bad / expired code).
- Types: `BffOtpRequestRequest`, `BffOtpVerifyRequest`, `BffOtpRequestResult`.

## 3.0.0 (2026-05-19)

Major release for Phase 2 of the identity-hardening initiative. Adds the
shared `BffAuthClient` — the same-origin client for a per-app
**Backend-For-Frontend** (`bff-katalogos`, `bff-erevna`). The BFF terminates
authentication server-side: the browser holds only an opaque httpOnly session
cookie, never a token.

This is the **new recommended auth surface**. The major bump signals that
recommendation — it is **not** a breaking change: every v2.x export
(`AuthClient`, the direct-KC ROPC adapters, `useDirectKcAuth`, the OIDC
primitives, storage adapters, hooks) remains and is unchanged. BaseClient
still consumes the direct-KC path; it is removed in a later phase.

### Added

- `BffAuthClient` — same-origin client for a per-app BFF. Methods:
  `login({username,password})` → `POST /bff/login`; `logout()` →
  `POST /bff/logout`; `getCurrentUser()` → `GET /bff/me`; `register(...)`,
  `forgotPassword(...)`, `resetPassword(...)` → the matching `/bff/*`
  endpoints. Every call is a same-origin `fetch` with
  `credentials: 'include'`; state-changing calls carry the `X-BFF-Csrf: 1`
  header the `Bff.AspNetCore` anti-forgery middleware requires. Does **no
  token handling** — the BFF owns tokens, the browser owns only the cookie.
- Types: `BffAuthClientOptions`, `BffLoginRequest`, `BffRegisterRequest`,
  `BffForgotPasswordRequest`, `BffResetPasswordRequest`, `BffUser`.

## 2.1.0 (2026-05-17)

Additive release. Lays the groundwork for the "shrink identity service"
migration by extracting the OIDC primitives that three apps (BaseClient,
`apps/erevna-web`, `apps/katalogos-web`) had each duplicated in their own
`useKeycloakExchange.ts` files. No breaking changes — v2.0 callers continue
to work unchanged.

### Added

#### New `/oidc` sub-path entry

- `@dloizides/auth-client/oidc` — Pure OIDC primitives (no React, no hooks).
  Lets non-React consumers tree-shake the `AuthClient` class away entirely.

#### OIDC primitives (also re-exported from the main entry)

- `fetchDiscoveryDocument({ issuerUrl, http })` — Fetches
  `{issuer}/.well-known/openid-configuration` and caches the result per
  issuer URL for the lifetime of the process. Throws on non-2xx or invalid
  metadata. Cache cleared with `clearDiscoveryCache()` (test-only).
- `generateCodeVerifier(length?)` — RFC 7636-compliant PKCE verifier
  generator. Defaults to 64 chars; enforces the 43..128 band.
- `deriveCodeChallenge(verifier)` — `BASE64URL(SHA256(verifier))` via
  `crypto.subtle` (browser + Node 16+). Matches the RFC 7636 Appendix B
  test vector.
- `generatePkcePair(length?)` — Convenience: fresh verifier + matching S256
  challenge in one call.
- `exchangeAuthorizationCode({ http, baseUrl, realm, clientId, code,
  redirectUri, codeVerifier })` — POSTs `grant_type=authorization_code` to
  the realm's token endpoint. Returns a normalised `TokenResponse`.
- `refreshAccessToken({ http, baseUrl, realm, clientId, refreshToken })` —
  POSTs `grant_type=refresh_token`. Same return shape.

#### `AuthClient` v2.1 surface

- `useDirectKcAuth?: boolean` config flag. Default `false`. When `true`,
  apps can route their PKCE flow through the shared `exchangeAuthorizationCode`
  primitive instead of the proxied identity-api `/auth/login` flow. The
  flag is read-only at runtime via `AuthClient.isDirectMode()` so apps can
  render conditionally on whether they've opted in.
- `acceptDirectKcTokens(response)` — Persists a `TokenResponse` produced by
  the direct-KC flow into the configured storage, marks the inactivity
  tracker active, and fires `onTokenAcquired`. Use this from the app's
  `useKeycloakExchange.ts` hook after `exchangeAuthorizationCode()` resolves.
- `acceptDirectKcRefresh(response)` — Same as above but fires
  `onTokenRefreshed` instead. Use after `refreshAccessToken()` swaps.
- `onTokenAcquired?: (tokens) => void` collaborator — fires after any login
  path (OTP, password, direct-KC) successfully persists a fresh token
  bundle. For app-side analytics/logging only — NOT designed for BFF
  integration (Phase 2 designs that fresh).
- `onTokenRefreshed?: (tokens) => void` collaborator — fires after any
  refresh (interceptor or direct-KC) persists a fresh bundle.

### Notes

- The `useDirectKcAuth` flag is the dormant-path flip mechanism. After v2.1
  ships, apps still default to the proxied path. Per-app cutover (flipping
  the flag to `true`) happens in subsequent steps of the
  shrink-identity-to-tenant-service migration.
- The proxied `/auth/login`, `/auth/refresh`, `/auth/refresh-cookie` methods
  on `AuthApiClient` are unchanged — production apps still call them.

## 2.0.0 (2026-05-07)

Major release. Extends the realm-aware OIDC core into a single source of truth for every auth surface in the dloizides.com portfolio: web cookies, mobile secure storage, biometric gating, silent token refresh with single-flight, inactivity enforcement, password reset, and sessions management.

### Added

#### New entry points

- `@dloizides/auth-client/react` — React Query hooks. Imported separately so non-React consumers (or pure-utility usage) don't load `react` / `@tanstack/react-query`.

#### Storage adapters

- `CookieTokenStorage` — web adapter that pairs an in-memory access token with a backend-managed `__Host-refresh` httpOnly cookie. The adapter intentionally does NOT persist refresh material into JS-readable storage; refresh swaps go via `/auth/refresh-cookie` with `credentials: 'include'`.
- `SecureStoreTokenStorage` — mobile adapter for `expo-secure-store`. Splits tokens across four slots (`auth.access`, `auth.refresh`, `auth.id`, `auth.expiresAt`) so the OS can apply different ACLs per slot. Optional `requireAuthentication` triggers OS biometric prompts on read. Optional `biometricGate` adds an in-process biometric check before reads.

#### Biometric

- `BiometricGate` — wraps `expo-local-authentication`. Provides `isAvailable`, `prompt`, `setEnabled`, `unlock`, `hydrate`. Opt-in by default. After 3 consecutive `unlock()` failures, throws `locked out` so consumers force a re-login.

#### Refresh / inactivity

- `RefreshInterceptor` — single-flight refresh queue with pluggable `RefreshFn`. Concurrent 401s join the same in-flight refresh; on failure the storage clears and `sessionExpired` fires once. Decoupled from transport — works for both `/auth/refresh` (mobile) and `/auth/refresh-cookie` (web).
- `InactivityTracker` — persists `lastRefreshedAt` via a pluggable `InactivityStore` and decides whether the session has aged past `maxInactivityDays` (default 90).

#### Events

- `AuthEventEmitter` — tiny zero-dependency event emitter with `sessionExpired` event. Subscriptions return an unsubscribe function. Snapshot dispatch so listeners may unsubscribe mid-emit.

#### HTTP transport

- `HttpClient` interface + `createFetchHttpClient(fetch)` factory. Lets the auth API client work with native fetch, axios, ky, or any caller-supplied transport.

#### API client

- `AuthApiClient` — typed wrapper for `IdentityService` auth endpoints: `loginWithOtp`, `loginWithPassword`, `refreshCookie`, `logout`, `forgotPassword`, `resetPassword`, `listSessions`, `revokeSession`. Supports optional Bearer auth and cookie credentials.

#### `AuthClient` collaborators

- `AuthClient` constructor accepts an optional `AuthClientCollaborators` bag: `{ api, interceptor, inactivityTracker, events }`. v1 callers continue to work — collaborators are all optional.
- New methods on `AuthClient`: `init()`, `refresh()`, `loginWithOtp()`, `loginWithPassword()`, `logout({ everywhere })`, `requestPasswordReset()`, `confirmPasswordReset()`, `on('sessionExpired', listener)`.
- `buildAuthorizationUrl({ offlineAccess: true })` appends `offline_access` to scope (idempotent if already present).

#### React Query hooks (under `@dloizides/auth-client/react`)

- `useForgotPassword({ api })` — POST `/auth/forgot-password`.
- `useResetPassword({ api })` — POST `/auth/reset-password`.
- `useSessions({ api })` — GET `/me/sessions` with exported `SESSIONS_QUERY_KEY` for invalidation.
- `useRevokeSession({ api })` — POST `/me/sessions/{id}/revoke`. Auto-invalidates the sessions query.
- `useLogoutEverywhere({ client })` — calls `AuthClient.logout({ everywhere: true })` and invalidates the sessions query.

### Peer dependencies

- `react` (`>=17.0.0`) — optional, only needed when importing from `@dloizides/auth-client/react`.
- `@tanstack/react-query` (`^5.0.0`) — optional, same as react.
- `expo-secure-store` — optional, only needed by `SecureStoreTokenStorage` consumers (i.e. mobile). Web bundles never load it.
- `expo-local-authentication` — optional, only needed by `BiometricGate` consumers.

### Migration from v1.x

The v1 API is fully preserved. To upgrade in a no-op way:

```ts
// v1 — still works in v2
const auth = new AuthClient(config, storage);
```

To opt into v2 features, pass collaborators:

```ts
import {
  AuthClient,
  AuthApiClient,
  RefreshInterceptor,
  InactivityTracker,
  AuthEventEmitter,
  CookieTokenStorage,        // web
  createFetchHttpClient,
} from '@dloizides/auth-client';

const events = new AuthEventEmitter();
const storage = new CookieTokenStorage();
const http = createFetchHttpClient(fetch);
const api = new AuthApiClient({ http, baseUrl: 'https://api.dloizides.com', useCredentials: true });
const interceptor = new RefreshInterceptor({
  storage,
  events,
  refresh: async () => {
    const raw = await api.refreshCookie();
    if (typeof raw.access_token !== 'string') return null;
    // …convert to AuthTokens
  },
});
const inactivityTracker = new InactivityTracker({
  store: yourPlatformInactivityStore,
  maxInactivityDays: 90,
});

const auth = new AuthClient(config, storage, { api, interceptor, inactivityTracker, events });

events.on('sessionExpired', () => navigate('/login'));
const { hasSession } = await auth.init();
```

Hooks live in the React entry point:

```ts
import { useSessions, useRevokeSession } from '@dloizides/auth-client/react';
```

### Coverage

100% statements / branches / functions / lines (290 tests).

## 1.0.0 (2026-05-01)

Initial production release. Extracts realm-aware auth helpers from `BaseClient/src/auth/`.

### Added

- `AuthClient` class with constructor-injected `realm`, `clientId`, `baseUrl`. `AuthClient.fromIssuerUrl()` factory for migrating from a legacy issuer URL.
- Token storage adapters: `InMemoryTokenStorage`, `BrowserStorageTokenStorage` (wraps any `Storage`-shaped backend).
- Pure URL builders: `buildIssuerUrl`, `buildAuthorizationEndpoint`, `buildTokenEndpoint`, `buildUserInfoEndpoint`, `buildLogoutEndpoint`, `buildAuthorizationUrl`.
- Pure body builders: `buildAuthorizationCodeBody`, `buildRefreshTokenBody`.
- Pure helpers: `extractAuthCode`, `normalizeTokenResponse`, `tokenResponseToAuthTokens`, `isTokenExpired`, `computeExpiresAt`, `decodeJwt`, `normalizeKeycloakUser`, `parseRealmFromIssuer`, `parseBaseUrlFromIssuer`.
- Types: `AuthClientConfig`, `AuthTokens`, `TokenStorage`, `RawTokenResponse`, `TokenResponse`, `KeycloakUserInfo`, `NormalizedUser`, `KeycloakRoles` (`const enum` + `isKeycloakRole` guard).

### Coverage

100% statements / branches / functions / lines (138 tests).
