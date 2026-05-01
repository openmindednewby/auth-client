/**
 * Persisted token bundle.
 *
 * `expiresAt` is an absolute UNIX millisecond timestamp computed at
 * acquisition time (`Date.now() + expires_in * 1000`) so consumers can
 * trivially compare against `Date.now()` without re-deriving an expiry clock.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Absolute UNIX millis. `0` or missing means unknown — treat as expired. */
  expiresAt: number;
}
