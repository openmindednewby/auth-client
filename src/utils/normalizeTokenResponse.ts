import type { AuthTokens } from '../types/AuthTokens';
import type { RawTokenResponse, TokenResponse } from '../types/TokenResponse';
import { computeExpiresAt } from './isTokenExpired';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Map a raw OIDC token endpoint response (snake_case) to camelCase.
 *
 * Throws when `access_token` is missing or empty — callers should let this
 * propagate to the auth state machine, which treats it as a login failure.
 */
export function normalizeTokenResponse(raw: RawTokenResponse): TokenResponse {
  const accessToken = asString(raw.access_token);
  if (accessToken === undefined) {
    throw new Error('Token response missing access_token');
  }
  return {
    accessToken,
    refreshToken: asString(raw.refresh_token),
    idToken: asString(raw.id_token),
    expiresIn: asNumber(raw.expires_in),
    tokenType: asString(raw.token_type),
    scope: asString(raw.scope),
  };
}

/**
 * Convert a normalized {@link TokenResponse} into a persistable
 * {@link AuthTokens} bundle by computing `expiresAt` from `expiresIn`.
 */
export function tokenResponseToAuthTokens(
  response: TokenResponse,
  now: number = Date.now(),
): AuthTokens {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    idToken: response.idToken,
    expiresAt: computeExpiresAt(response.expiresIn, now),
  };
}
