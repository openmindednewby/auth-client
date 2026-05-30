/**
 * `@dloizides/auth-client/oidc` — Shared OIDC primitives.
 *
 * Pure helpers (no React, no hooks) for the direct-to-Keycloak PKCE flow.
 * Consumed by app-side hooks that previously duplicated this logic in their
 * own `useKeycloakExchange.ts` files.
 *
 * Introduced in v2.1.0 as part of the "shrink identity service" migration.
 */

export {
  clearDiscoveryCache,
  fetchDiscoveryDocument,
  type FetchDiscoveryDocumentInput,
  type OidcDiscoveryDocument,
} from './discovery';
export {
  deriveCodeChallenge,
  generateCodeVerifier,
  generatePkcePair,
  type PkcePair,
} from './pkce';
export {
  exchangeAuthorizationCode,
  refreshAccessToken,
  type ExchangeAuthorizationCodeInput,
  type RefreshAccessTokenInput,
} from './tokenExchange';
