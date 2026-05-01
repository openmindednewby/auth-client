import type { AuthTokens } from '../types/AuthTokens';
import type { TokenStorage } from '../types/TokenStorage';

/**
 * Subset of `Storage` we actually use. Lets callers inject `localStorage`,
 * `sessionStorage`, or any compatible polyfill.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BrowserStorageTokenStorageOptions {
  storage: StorageLike;
  /** Storage key. Defaults to `auth.tokens`. */
  key?: string;
}

const DEFAULT_KEY = 'auth.tokens';

function isAuthTokens(value: unknown): value is AuthTokens {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.accessToken === 'string' && typeof candidate.expiresAt === 'number';
}

/**
 * Persist tokens in any `Storage`-shaped backend (`localStorage`, `sessionStorage`,
 * AsyncStorage shim, etc.). The class is sync-aware but exposes a Promise-based
 * API to match {@link TokenStorage}.
 *
 * Errors during read are swallowed and surfaced as `null` (corrupt JSON, denied
 * access in some private-mode browsers, etc.). Errors during write/clear are
 * propagated so callers can decide whether to retry or fall back.
 */
export class BrowserStorageTokenStorage implements TokenStorage {
  private readonly storage: StorageLike;
  private readonly key: string;

  constructor(options: BrowserStorageTokenStorageOptions) {
    this.storage = options.storage;
    this.key = options.key ?? DEFAULT_KEY;
  }

  read(): Promise<AuthTokens | null> {
    return Promise.resolve(this.readSync());
  }

  write(tokens: AuthTokens): Promise<void> {
    this.storage.setItem(this.key, JSON.stringify(tokens));
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.storage.removeItem(this.key);
    return Promise.resolve();
  }

  private readSync(): AuthTokens | null {
    try {
      const raw = this.storage.getItem(this.key);
      if (raw === null || raw === '') {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      return isAuthTokens(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
