/**
 * `@dloizides/auth-client` — realm-aware Keycloak/OIDC helpers.
 *
 * Designed for the dloizides.com portfolio split (Questioner ⇄ OnlineMenu and
 * future products): every consumer supplies its own `realm` and `clientId`,
 * never inherits them.
 */

// Class
export { AuthClient } from './AuthClient';
export type { AuthClientFromIssuerInput } from './AuthClient';

// Types
export type {
  AuthClientConfig,
  AuthTokens,
  KeycloakUserInfo,
  NormalizedUser,
  RawTokenResponse,
  TokenResponse,
  TokenStorage,
} from './types';
export { KeycloakRoles, isKeycloakRole } from './types';

// Storage adapters
export {
  BrowserStorageTokenStorage,
  type BrowserStorageTokenStorageOptions,
  type StorageLike,
} from './storage/BrowserStorageTokenStorage';
export { InMemoryTokenStorage } from './storage/InMemoryTokenStorage';

// Pure helpers
export { normalizeKeycloakUser } from './utils/normalizeKeycloakUser';
export { parseBaseUrlFromIssuer, parseRealmFromIssuer } from './utils/parseRealmFromIssuer';
export {
  buildAuthorizationCodeBody,
  buildRefreshTokenBody,
  type AuthorizationCodeBodyInput,
  type RefreshTokenBodyInput,
} from './utils/buildTokenRequestBody';
export {
  buildAuthorizationEndpoint,
  buildAuthorizationUrl,
  buildIssuerUrl,
  buildLogoutEndpoint,
  buildTokenEndpoint,
  buildUserInfoEndpoint,
  type AuthorizationUrlInput,
} from './utils/buildKeycloakUrls';
export { extractAuthCode, type AuthorizationResponseLike } from './utils/extractAuthCode';
export { computeExpiresAt, isTokenExpired } from './utils/isTokenExpired';
export { decodeJwt } from './utils/decodeJwt';
export {
  normalizeTokenResponse,
  tokenResponseToAuthTokens,
} from './utils/normalizeTokenResponse';
