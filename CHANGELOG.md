# Changelog

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
