# Changelog

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
