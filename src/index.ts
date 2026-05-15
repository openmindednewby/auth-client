/**
 * `@dloizides/auth-client` — realm-aware Keycloak/OIDC helpers.
 *
 * Designed for the dloizides.com portfolio split (Questioner ⇄ OnlineMenu and
 * future products): every consumer supplies its own `realm` and `clientId`,
 * never inherits them.
 */

// Class
export { AuthClient } from './AuthClient';
export type {
  AuthClientCollaborators,
  AuthClientFromIssuerInput,
  LoginOptions,
  LogoutOptions,
} from './AuthClient';

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
export { CookieTokenStorage } from './storage/CookieTokenStorage';
export {
  SecureStoreTokenStorage,
  type SecureStoreTokenStorageOptions,
  type SecureStoreLike,
  type BiometricGateLike,
} from './storage/SecureStoreTokenStorage';

// Biometric
export {
  BiometricGate,
  type BiometricGateOptions,
  type BiometricFlagStore,
  type LocalAuthLike,
} from './biometric/BiometricGate';

// Refresh interceptor
export { RefreshInterceptor, type RefreshFn, type RefreshInterceptorOptions } from './interceptor/RefreshInterceptor';

// Inactivity tracker
export { InactivityTracker, type InactivityStore, type InactivityTrackerOptions } from './inactivity/InactivityTracker';

// Events
export {
  AuthEventEmitter,
  type AuthEventListener,
  type AuthEventName,
  type AuthEventUnsubscribe,
} from './events/AuthEventEmitter';

// HTTP transport
export { createFetchHttpClient, type HttpClient, type HttpRequest, type HttpResponse } from './http/HttpClient';

// API client
export {
  AuthApiClient,
  type AuthApiClientOptions,
  type AuthSessionInfo,
  type ForgotPasswordRequest,
  type OtpLoginRequest,
  type PasswordLoginRequest,
  type RawAuthLoginResponse,
  type ResetPasswordRequest,
} from './api/AuthApiClient';

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
