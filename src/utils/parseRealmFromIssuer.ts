/**
 * Extract the realm name from a Keycloak issuer URL.
 *
 * Keycloak issuer URLs follow the shape `{baseUrl}/realms/{realm}` (with optional
 * `/protocol/openid-connect` suffix on token endpoints). This helper reverses
 * that convention so existing apps that store only the issuer URL can derive
 * `realm` for the realm-aware {@link AuthClient} constructor.
 *
 * @returns the realm name, or `null` if the URL doesn't match the convention.
 */
export function parseRealmFromIssuer(issuerUrl: string | null | undefined): string | null {
  if (typeof issuerUrl !== 'string' || issuerUrl === '') {
    return null;
  }
  const match = /\/realms\/([^/?#]+)/i.exec(issuerUrl);
  if (!match || match[1] === undefined || match[1] === '') {
    return null;
  }
  return decodeURIComponent(match[1]);
}

/**
 * Extract the base URL (scheme + host + optional path prefix) from a
 * Keycloak issuer URL by stripping the `/realms/{realm}...` suffix.
 *
 * Returns the original input unchanged when no `/realms/` segment is found —
 * callers that need strict validation should pair this with `parseRealmFromIssuer`.
 */
export function parseBaseUrlFromIssuer(issuerUrl: string | null | undefined): string | null {
  if (typeof issuerUrl !== 'string' || issuerUrl === '') {
    return null;
  }
  const idx = issuerUrl.search(/\/realms\//i);
  if (idx === -1) {
    return issuerUrl.replace(/\/$/, '');
  }
  return issuerUrl.substring(0, idx).replace(/\/$/, '');
}
