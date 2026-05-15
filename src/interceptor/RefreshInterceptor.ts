import type { AuthEventEmitter } from '../events/AuthEventEmitter';
import type { AuthTokens } from '../types/AuthTokens';
import type { TokenStorage } from '../types/TokenStorage';

/**
 * The pluggable refresh function the interceptor calls when an access token
 * is missing or expired. Implementations differ per transport:
 *
 * - **Mobile (SecureStore)**: posts to `/auth/refresh` with the refresh token
 *   from `AuthTokens.refreshToken`.
 * - **Web (Cookie)**: posts to `/auth/refresh-cookie` with `credentials:
 *   'include'` — the refresh token rides on the httpOnly cookie; `current`
 *   carries only the access token (refresh token will be undefined).
 *
 * Returns the new token bundle, or `null` when refresh failed in a way that
 * means "session over" (e.g., 401 from the auth server).
 */
export type RefreshFn = (current: AuthTokens | null) => Promise<AuthTokens | null>;

export interface RefreshInterceptorOptions {
  storage: TokenStorage;
  refresh: RefreshFn;
  events: AuthEventEmitter;
  /**
   * Optional callback fired AFTER tokens are persisted on a successful
   * refresh. Used by `AuthClient` to update the inactivity tracker.
   */
  onRefreshSuccess?: (tokens: AuthTokens) => Promise<void> | void;
}

/**
 * Coordinates refresh-token swaps so concurrent 401s don't trigger N parallel
 * refreshes. The first caller to hit `refreshTokens()` while no refresh is
 * already in flight wins the role of "refresher"; everyone else awaits the
 * same promise.
 *
 * On failure, storage is cleared and `sessionExpired` is emitted exactly once
 * per refresh attempt.
 */
export class RefreshInterceptor {
  private readonly storage: TokenStorage;
  private readonly refresh: RefreshFn;
  private readonly events: AuthEventEmitter;
  private readonly onRefreshSuccess: ((tokens: AuthTokens) => Promise<void> | void) | undefined;
  private inflight: Promise<AuthTokens | null> | null = null;

  constructor(options: RefreshInterceptorOptions) {
    this.storage = options.storage;
    this.refresh = options.refresh;
    this.events = options.events;
    this.onRefreshSuccess = options.onRefreshSuccess;
  }

  /**
   * Trigger (or join) a refresh. Returns the new tokens, or `null` if the
   * refresh failed — in which case storage has already been cleared and
   * `sessionExpired` already fired.
   */
  async refreshTokens(): Promise<AuthTokens | null> {
    if (this.inflight !== null) {
      return this.inflight;
    }
    this.inflight = this.runRefresh();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  /**
   * Whether a refresh is currently in flight. Exposed for tests / debug.
   */
  get isRefreshing(): boolean {
    return this.inflight !== null;
  }

  private async runRefresh(): Promise<AuthTokens | null> {
    const current = await this.storage.read();
    let next: AuthTokens | null;
    try {
      next = await this.refresh(current);
    } catch {
      await this.failHard();
      return null;
    }
    if (next === null) {
      await this.failHard();
      return null;
    }
    await this.storage.write(next);
    if (this.onRefreshSuccess !== undefined) {
      await this.onRefreshSuccess(next);
    }
    return next;
  }

  private async failHard(): Promise<void> {
    await this.storage.clear();
    this.events.emit('sessionExpired');
  }
}
