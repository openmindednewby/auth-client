import type { AuthTokens } from '../types/AuthTokens';
import type { TokenStorage } from '../types/TokenStorage';

/**
 * Web token storage that pairs an in-memory access token with a backend-managed
 * httpOnly + Secure + SameSite=Lax refresh-token cookie.
 *
 * The browser handles the refresh cookie (`__Host-refresh` by default — set by
 * the IdentityService on login and rotated on every `/auth/refresh-cookie`
 * call). JavaScript MUST NOT have access to it, so this adapter intentionally
 * does NOT persist `refreshToken` into the cookie itself; that's the backend's
 * job. The adapter just keeps the access token in memory and exposes the same
 * `TokenStorage` interface as `BrowserStorageTokenStorage` so the rest of the
 * library doesn't need to know which transport is in use.
 *
 * Page reloads drop the access token (memory clears), but the refresh cookie
 * survives — `RefreshInterceptor` swaps it for a new access token via
 * `/auth/refresh-cookie` with `credentials: 'include'`.
 */
export class CookieTokenStorage implements TokenStorage {
  private accessToken: string | null = null;
  private idToken: string | undefined = undefined;
  private expiresAt: number = 0;

  read(): Promise<AuthTokens | null> {
    if (this.accessToken === null) {
      return Promise.resolve(null);
    }
    const tokens: AuthTokens = {
      accessToken: this.accessToken,
      idToken: this.idToken,
      expiresAt: this.expiresAt,
    };
    return Promise.resolve(tokens);
  }

  write(tokens: AuthTokens): Promise<void> {
    this.accessToken = tokens.accessToken;
    this.idToken = tokens.idToken;
    this.expiresAt = tokens.expiresAt;
    // Intentionally drop tokens.refreshToken — the backend cookie is the
    // source of truth for refresh material, and we never want it on JS heap.
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.accessToken = null;
    this.idToken = undefined;
    this.expiresAt = 0;
    return Promise.resolve();
  }
}
