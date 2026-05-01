# @dloizides/auth-client

Realm-aware Keycloak / OIDC helpers for the dloizides.com portfolio. Takes `realm` and `clientId` as config — never hardcodes them — so the same package serves every product (Questioner, OnlineMenu, future apps) with its own Keycloak realm.

## Why

Phase 2 of the Questioner ⇄ OnlineMenu product split puts each product on its own Keycloak realm. A Questioner-realm token must never be accepted by the OnlineMenu service, and vice versa. This package centralises every realm-aware concern (URL derivation, PKCE flow building blocks, token persistence, JWT decoding, user normalisation) so each app instance is wired to exactly one realm via constructor config.

## Install

```bash
npm install @dloizides/auth-client
```

## Quick start

```ts
import {
  AuthClient,
  BrowserStorageTokenStorage,
  normalizeKeycloakUser,
} from '@dloizides/auth-client';

const storage = new BrowserStorageTokenStorage({ storage: localStorage });

const auth = new AuthClient(
  {
    baseUrl: 'https://identity.dloizides.com',
    realm: 'OnlineMenu',         // product-specific
    clientId: 'online-menu-client',
    redirectUri: 'http://localhost:8082',
    scope: 'openid profile email offline_access',
  },
  storage,
);

// Derived URLs (always realm-aware):
auth.issuerUrl;              // https://identity.dloizides.com/realms/OnlineMenu
auth.tokenEndpoint;          // .../realms/OnlineMenu/protocol/openid-connect/token
auth.userInfoEndpoint;       // .../realms/OnlineMenu/protocol/openid-connect/userinfo
auth.buildAuthorizationUrl({ state: 'xyz', codeChallenge: 'abc' });
```

### Migrating from a legacy issuer URL

If your app currently stores only an issuer URL like `https://identity.dloizides.com/realms/OnlineMenu`, derive the realm and base URL automatically:

```ts
const auth = AuthClient.fromIssuerUrl(
  {
    issuerUrl: process.env.KEYCLOAK_ISSUER!,
    clientId: 'online-menu-client',
  },
  storage,
);
```

## What's in the box

### Class

- `AuthClient` — realm-aware container for config + storage. Exposes `issuerUrl`, `authorizationEndpoint`, `tokenEndpoint`, `userInfoEndpoint`, `logoutEndpoint`, `buildAuthorizationUrl()`, `getAccessToken()`, `getTokens()` / `setTokens()` / `clearTokens()`.

### Token storage adapters

- `InMemoryTokenStorage` — for tests and SSR.
- `BrowserStorageTokenStorage` — wraps any `Storage`-shaped backend (`localStorage`, `sessionStorage`, AsyncStorage shim).

Bring your own implementation by satisfying the `TokenStorage` interface (`read` / `write` / `clear`).

### Pure helpers (zero-dependency, fully tested)

- `parseRealmFromIssuer(url)` / `parseBaseUrlFromIssuer(url)` — split a Keycloak issuer URL.
- `buildIssuerUrl`, `buildAuthorizationEndpoint`, `buildTokenEndpoint`, `buildUserInfoEndpoint`, `buildLogoutEndpoint`, `buildAuthorizationUrl` — realm-aware URL builders.
- `buildAuthorizationCodeBody`, `buildRefreshTokenBody` — `application/x-www-form-urlencoded` body helpers for the token endpoint.
- `extractAuthCode(response)` — pull the `code` out of an `expo-auth-session` (or browser) redirect response.
- `normalizeTokenResponse(raw)` / `tokenResponseToAuthTokens(response)` — snake_case → camelCase + absolute `expiresAt` computation.
- `isTokenExpired(tokens, leewayMs?, now?)` / `computeExpiresAt(expiresIn, now?)` — clock-aware expiry checks with default 30 s leeway.
- `decodeJwt<T>(token)` — base64url-decode the payload of a compact JWT (no signature verification — UI only).
- `normalizeKeycloakUser(userInfo)` — collapse Keycloak `realm_access` + `resource_access` roles into a deduplicated `roles[]` array, pick a sensible `displayName` / `username`.

### Types

- `AuthClientConfig`, `AuthTokens`, `TokenStorage`, `RawTokenResponse`, `TokenResponse`
- `KeycloakUserInfo`, `NormalizedUser`, `KeycloakRoles` (`const enum` + `isKeycloakRole` guard)

## Coverage

100% statements / branches / functions / lines. Test runner: Jest with `ts-jest`.

## License

MIT
