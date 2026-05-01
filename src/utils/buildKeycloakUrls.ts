/**
 * URL builders for the realm-aware Keycloak surface area.
 *
 * Every helper takes `baseUrl` and `realm` explicitly — no hardcoded realm
 * names. This is the contract that Phase 2 of the product split relies on:
 * the same package serves the future Questioner-realm app and OnlineMenu-realm
 * app without code change.
 */

const REALM_PATH_PREFIX = '/realms';
const PROTOCOL_PATH = '/protocol/openid-connect';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

/**
 * Compute the issuer URL: `{baseUrl}/realms/{realm}`.
 */
export function buildIssuerUrl(baseUrl: string, realm: string): string {
  return `${trimTrailingSlash(baseUrl)}${REALM_PATH_PREFIX}/${encodeURIComponent(realm)}`;
}

/**
 * Compute the authorization endpoint URL.
 */
export function buildAuthorizationEndpoint(baseUrl: string, realm: string): string {
  return `${buildIssuerUrl(baseUrl, realm)}${PROTOCOL_PATH}/auth`;
}

/**
 * Compute the token endpoint URL.
 */
export function buildTokenEndpoint(baseUrl: string, realm: string): string {
  return `${buildIssuerUrl(baseUrl, realm)}${PROTOCOL_PATH}/token`;
}

/**
 * Compute the userinfo endpoint URL.
 */
export function buildUserInfoEndpoint(baseUrl: string, realm: string): string {
  return `${buildIssuerUrl(baseUrl, realm)}${PROTOCOL_PATH}/userinfo`;
}

/**
 * Compute the logout endpoint URL.
 */
export function buildLogoutEndpoint(baseUrl: string, realm: string): string {
  return `${buildIssuerUrl(baseUrl, realm)}${PROTOCOL_PATH}/logout`;
}

export interface AuthorizationUrlInput {
  baseUrl: string;
  realm: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
}

/**
 * Build a complete authorization URL the user agent can navigate to.
 *
 * All PKCE-related fields are optional so this helper also serves
 * non-PKCE flows (e.g. confidential server-side clients) — but PKCE is
 * the recommended path for SPA / native consumers.
 */
export function buildAuthorizationUrl(input: AuthorizationUrlInput): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
  });
  if (typeof input.scope === 'string' && input.scope !== '') {
    params.set('scope', input.scope);
  }
  if (typeof input.state === 'string' && input.state !== '') {
    params.set('state', input.state);
  }
  if (typeof input.codeChallenge === 'string' && input.codeChallenge !== '') {
    params.set('code_challenge', input.codeChallenge);
    params.set('code_challenge_method', input.codeChallengeMethod ?? 'S256');
  }
  return `${buildAuthorizationEndpoint(input.baseUrl, input.realm)}?${params.toString()}`;
}
