import type { AuthTokens } from '../types/AuthTokens';

const SECONDS_TO_MILLIS = 1000;
const DEFAULT_LEEWAY_MS = 30 * SECONDS_TO_MILLIS;

/**
 * Determine whether a token bundle is expired.
 *
 * `expiresAt` is interpreted as an absolute UNIX millisecond timestamp.
 *
 * `leewayMs` (default 30 s) shaves a small window off the expiry to compensate
 * for clock skew and round-trip latency: a token that expires at exactly
 * `Date.now()` is essentially useless because by the time the request arrives
 * at the API it will have expired.
 */
export function isTokenExpired(
  tokens: Pick<AuthTokens, 'expiresAt'> | null | undefined,
  leewayMs: number = DEFAULT_LEEWAY_MS,
  now: number = Date.now(),
): boolean {
  if (!tokens) {
    return true;
  }
  if (typeof tokens.expiresAt !== 'number' || tokens.expiresAt <= 0) {
    return true;
  }
  return tokens.expiresAt - leewayMs <= now;
}

/**
 * Compute the absolute expiry timestamp from a token endpoint `expires_in` value.
 *
 * Returns `0` when `expiresIn` is missing or non-positive — signalling "unknown
 * expiry, treat as expired" downstream.
 */
export function computeExpiresAt(
  expiresInSeconds: number | undefined,
  now: number = Date.now(),
): number {
  if (typeof expiresInSeconds !== 'number' || expiresInSeconds <= 0) {
    return 0;
  }
  return now + expiresInSeconds * SECONDS_TO_MILLIS;
}
