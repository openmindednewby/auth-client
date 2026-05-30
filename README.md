# @dloizides/auth-client

Realm-aware Keycloak / OIDC client for the dloizides.com portfolio. v2 extends the v1 PKCE / token-storage core with platform-specific adapters (cookie web, secure-store mobile, biometric gate), silent token refresh with single-flight, inactivity enforcement, password reset, and React Query hooks for sessions management.

## Why one package across four products

Phase 2 of the Questioner ⇄ OnlineMenu split puts each product on its own Keycloak realm. A Questioner-realm token must never be accepted by the OnlineMenu service, and vice versa. The v1 surface centralised every realm-aware concern (URL derivation, PKCE building blocks, token persistence, JWT decoding, user normalisation) so each app instance is wired to exactly one realm via constructor config.

v2 widens that to **all** auth machinery: persistent sessions, refresh, biometric gating, sessions list/revoke, password reset, login orchestration. Same library, configured per-platform via adapters. Adding a fifth product or a new mobile app means picking the right adapter and going.

## Install

```bash
npm install @dloizides/auth-client
```

Optional peer dependencies:

| Peer | Required when |
|------|---------------|
| `react` (`>=17`) | Importing from `@dloizides/auth-client/react` |
| `@tanstack/react-query` (`^5`) | Importing from `@dloizides/auth-client/react` |
| `expo-secure-store` | Using `SecureStoreTokenStorage` (mobile only) |
| `expo-local-authentication` | Using `BiometricGate` (mobile only) |

Web bundles never pull in `expo-*` packages — those modules import via injected adapter interfaces, not direct module references.

## Quick start (web, cookie auth)

```ts
import {
  AuthClient,
  AuthApiClient,
  RefreshInterceptor,
  InactivityTracker,
  AuthEventEmitter,
  CookieTokenStorage,
  createFetchHttpClient,
  tokenResponseToAuthTokens,
  normalizeTokenResponse,
} from '@dloizides/auth-client';

const events = new AuthEventEmitter();
const storage = new CookieTokenStorage();
const http = createFetchHttpClient(window.fetch.bind(window));
const api = new AuthApiClient({
  http,
  baseUrl: 'https://api.dloizides.com',
  useCredentials: true,                 // sends the __Host-refresh cookie
  getAccessToken: () => storage.read().then((t) => t?.accessToken ?? null),
});

const interceptor = new RefreshInterceptor({
  storage,
  events,
  refresh: async () => {
    const raw = await api.refreshCookie();
    if (typeof raw.access_token !== 'string' || raw.access_token === '') return null;
    return tokenResponseToAuthTokens(normalizeTokenResponse({ ...raw, access_token: raw.access_token }));
  },
  onRefreshSuccess: () => inactivity.markActive(),
});

const inactivity = new InactivityTracker({ store: yourInactivityStore });

const auth = new AuthClient(
  {
    baseUrl: 'https://identity.dloizides.com',
    realm: 'OnlineMenu',
    clientId: 'online-menu-client',
    redirectUri: 'http://localhost:8082',
    scope: 'openid profile email offline_access',
  },
  storage,
  { api, interceptor, inactivityTracker: inactivity, events },
);

events.on('sessionExpired', () => navigate('/login'));
const { hasSession } = await auth.init();
```

## Quick start (mobile, secure-store)

```ts
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  AuthClient,
  AuthApiClient,
  BiometricGate,
  InactivityTracker,
  RefreshInterceptor,
  SecureStoreTokenStorage,
  AuthEventEmitter,
  createFetchHttpClient,
} from '@dloizides/auth-client';

const events = new AuthEventEmitter();

const biometricGate = new BiometricGate({
  localAuth: {
    hasHardwareAsync: LocalAuthentication.hasHardwareAsync,
    isEnrolledAsync: LocalAuthentication.isEnrolledAsync,
    authenticateAsync: (opts) => LocalAuthentication.authenticateAsync(opts),
  },
  flagStore: yourBiometricFlagStore, // optional persistence for the user's opt-in
});

const storage = new SecureStoreTokenStorage({
  secureStore: {
    getItemAsync: SecureStore.getItemAsync,
    setItemAsync: SecureStore.setItemAsync,
    deleteItemAsync: SecureStore.deleteItemAsync,
  },
  requireAuthentication: true,
  biometricGate,
});

await biometricGate.hydrate();
```

## BFF auth (v3 — recommended)

`BffAuthClient` is the same-origin client for a per-app **Backend-For-Frontend**
(`bff-katalogos`, `bff-erevna`). The BFF terminates authentication
server-side: it does ROPC against Keycloak with a confidential client, stores
the tokens in a Redis vault, and hands the browser only an opaque httpOnly
session cookie. The SPA never sees a token — an XSS cannot exfiltrate one.

`BffAuthClient` does **no token handling**: every call is a same-origin
`fetch` with `credentials: 'include'`, and state-changing calls carry the
`X-BFF-Csrf: 1` header the BFF anti-forgery middleware requires.

```ts
import { BffAuthClient, createFetchHttpClient } from '@dloizides/auth-client';

const bff = new BffAuthClient({
  http: createFetchHttpClient(window.fetch.bind(window)),
  // baseUrl defaults to '' (same-origin) — the production wiring.
});

// Login — the BFF does ROPC server-side and sets the session cookie.
const user = await bff.login({ username, password });

// Bootstrap on app load — null when there is no live session.
const current = await bff.getCurrentUser();

await bff.register({ firstName, lastName, username, email, password, tenantName });
await bff.forgotPassword({ email, resetUrlTemplate });
await bff.resetPassword({ token, newPassword });
await bff.logout();
```

The direct-KC `AuthClient` / ROPC surface below is retained for consumers not
yet on a BFF; it is deprecated and removed once every app has migrated.

## React Query hooks

```ts
import { useSessions, useRevokeSession, useLogoutEverywhere, useForgotPassword, useResetPassword } from '@dloizides/auth-client/react';

const { data: sessions, isLoading } = useSessions({ api });
const revoke = useRevokeSession({ api });
const logoutEverywhere = useLogoutEverywhere({ client: auth });
const forgot = useForgotPassword({ api });
const reset = useResetPassword({ api });

// In your component
revoke.mutate(sessionId);
logoutEverywhere.mutate();
forgot.mutate({ email });
reset.mutate({ token, newPassword });
```

## Lifecycle events

`AuthEventEmitter` exposes a `sessionExpired` event:

```ts
auth.on('sessionExpired', () => {
  navigate('/login');
});
```

`sessionExpired` fires when:

- The inactivity tracker reports the session has aged past `maxInactivityDays` (during `auth.init()`).
- A refresh attempt fails (`RefreshInterceptor` clears storage and emits the event exactly once per attempt, even when joined by N concurrent waiters).

## What's in the box

### Core (`@dloizides/auth-client`)

- `BffAuthClient` — same-origin client for a per-app Backend-For-Frontend. `login()`, `logout()`, `getCurrentUser()`, `register()`, `forgotPassword()`, `resetPassword()`. No token handling — the BFF owns tokens, the browser owns only an httpOnly cookie. **The recommended auth surface (v3).**
- `AuthClient` — realm-aware orchestrator. `init()`, `refresh()`, `loginWithOtp()`, `loginWithPassword()`, `logout({ everywhere })`, `requestPasswordReset()`, `confirmPasswordReset()`, plus the v1 surface (`getAccessToken`, `getTokens`, `setTokens`, `clearTokens`, `buildAuthorizationUrl`, etc.). Direct-KC ROPC; deprecated in favour of `BffAuthClient`.
- `AuthApiClient` — typed wrapper for IdentityService auth endpoints.
- `AuthEventEmitter` — `sessionExpired` event.
- `RefreshInterceptor` — single-flight refresh queue.
- `InactivityTracker` — 90-day default timeout (configurable).
- Storage adapters: `InMemoryTokenStorage`, `BrowserStorageTokenStorage`, `CookieTokenStorage`, `SecureStoreTokenStorage`.
- `BiometricGate` — wraps `expo-local-authentication`. 3-strikes lockout default.
- `createFetchHttpClient(fetch)` — `HttpClient` factory.
- All v1 pure helpers (URL builders, token body builders, JWT decoder, user normaliser).

### React (`@dloizides/auth-client/react`)

- `useForgotPassword`, `useResetPassword` — mutation hooks.
- `useSessions` — query hook with exported `SESSIONS_QUERY_KEY`.
- `useRevokeSession`, `useLogoutEverywhere` — mutation hooks that auto-invalidate the sessions query.

## Architecture decisions baked in

1. **Biometric is opt-in** via `BiometricGate.setEnabled(true)`. Default off so a fresh install doesn't gate the user behind a hardware prompt.
2. **Inactivity timeout default 90 days** (configurable). Mobile tasks chose this number; web matches.
3. **Single account per device.** The package has no multi-account surface — one refresh-token slot, period.
4. **No `react-native` import in package core.** RN-specific code lives in adapters that take injected interfaces (`SecureStoreLike`, `LocalAuthLike`). Web bundles don't pay for what they don't use.
5. **Cookie refresh material is server-managed.** `CookieTokenStorage.write()` discards `refreshToken` from the JS heap on purpose — refresh swaps go via `/auth/refresh-cookie` with `credentials: 'include'`.

## Coverage

100% statements / branches / functions / lines (290 tests). Test runner: Jest with `ts-jest`.

## License

MIT
