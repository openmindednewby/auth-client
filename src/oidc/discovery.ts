/**
 * OIDC discovery document fetcher.
 *
 * Fetches `{issuer}/.well-known/openid-configuration` and caches the result
 * per-issuer for the lifetime of the process. Discovery responses are stable
 * for hours; the cache prevents the auth flow from hitting KC on every login.
 *
 * Pure (no React, no hooks). Consumed by app-side hooks that orchestrate the
 * PKCE flow.
 */

import type { HttpClient } from '../http/HttpClient';

/**
 * Subset of the OIDC Discovery 1.0 metadata the auth-client needs.
 *
 * The KC discovery doc carries many more fields; we type only what the PKCE
 * flow consumes to keep the surface small and to fail loudly when KC ever
 * stops returning one of these.
 */
export interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
}

export interface FetchDiscoveryDocumentInput {
  /** Issuer URL — `{baseUrl}/realms/{realm}`. Trailing slash tolerated. */
  issuerUrl: string;
  /** Transport. Pass `createFetchHttpClient(fetch)` in browser/Node18+. */
  http: HttpClient;
}

const cache = new Map<string, OidcDiscoveryDocument>();

function normalizeIssuer(issuerUrl: string): string {
  return issuerUrl.replace(/\/$/, '');
}

function isOidcDiscoveryDocument(data: unknown): data is OidcDiscoveryDocument {
  if (data === null || typeof data !== 'object') {
    return false;
  }
  const d = data as Record<string, unknown>;
  return (
    typeof d.issuer === 'string'
    && d.issuer !== ''
    && typeof d.authorization_endpoint === 'string'
    && d.authorization_endpoint !== ''
    && typeof d.token_endpoint === 'string'
    && d.token_endpoint !== ''
  );
}

/**
 * Fetch + cache the OIDC discovery document for an issuer.
 *
 * Cache key = normalized issuer URL (trailing slash stripped).
 *
 * @throws Error when the HTTP call fails, returns non-2xx, or returns a body
 *         missing required OIDC metadata fields.
 */
export async function fetchDiscoveryDocument(
  input: FetchDiscoveryDocumentInput,
): Promise<OidcDiscoveryDocument> {
  const key = normalizeIssuer(input.issuerUrl);
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const response = await input.http({
    url: `${key}/.well-known/openid-configuration`,
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error(
      `OIDC discovery failed: ${String(response.status)} for ${key}`,
    );
  }
  if (!isOidcDiscoveryDocument(response.data)) {
    throw new Error(`OIDC discovery returned invalid metadata for ${key}`);
  }
  cache.set(key, response.data);
  return response.data;
}

/**
 * Clear the per-issuer discovery cache. Test-only — production code does not
 * call this. Useful when a test mocks different metadata across cases.
 */
export function clearDiscoveryCache(): void {
  cache.clear();
}
