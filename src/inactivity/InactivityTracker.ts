/**
 * Pluggable persistence for the `lastRefreshedAt` timestamp.
 *
 * Decoupled from `TokenStorage` so consumers can pick a different backend
 * (e.g., write through `AsyncStorage` on RN where the secure store would
 * gate every read on biometric).
 */
export interface InactivityStore {
  read(): Promise<number | null>;
  write(timestamp: number): Promise<void>;
  clear(): Promise<void>;
}

export interface InactivityTrackerOptions {
  store: InactivityStore;
  /**
   * Maximum days the user can be inactive (no successful refresh) before
   * sessions are forcibly cleared. Default 90 (matches mobile decision).
   */
  maxInactivityDays?: number;
  /** Inject for tests; defaults to `Date.now`. */
  now?: () => number;
}

const DEFAULT_MAX_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tracks the last time a refresh succeeded and decides whether the session
 * has aged past its inactivity threshold.
 *
 * - `markActive(now?)` is called by `RefreshInterceptor` after every
 *   successful token swap.
 * - `isExpired()` is called from `AuthClient.init()` at boot. If true,
 *   consumers clear tokens and emit `sessionExpired`.
 *
 * Choosing days (not e.g. minutes) makes the policy match what users
 * understand: a session left untouched for 90 days needs re-auth.
 */
export class InactivityTracker {
  private readonly store: InactivityStore;
  private readonly maxInactivityMs: number;
  private readonly now: () => number;

  constructor(options: InactivityTrackerOptions) {
    this.store = options.store;
    const days = options.maxInactivityDays ?? DEFAULT_MAX_DAYS;
    this.maxInactivityMs = days * MS_PER_DAY;
    this.now = options.now ?? Date.now;
  }

  async markActive(timestamp?: number): Promise<void> {
    await this.store.write(timestamp ?? this.now());
  }

  async getLastActive(): Promise<number | null> {
    return this.store.read();
  }

  async isExpired(): Promise<boolean> {
    const last = await this.store.read();
    if (last === null) {
      // Never refreshed — treat as not expired so a fresh login isn't punished.
      return false;
    }
    return this.now() - last > this.maxInactivityMs;
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }
}
