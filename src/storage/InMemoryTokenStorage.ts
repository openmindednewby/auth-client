import type { AuthTokens } from '../types/AuthTokens';
import type { TokenStorage } from '../types/TokenStorage';

/**
 * In-memory storage backed by a single instance variable.
 *
 * Useful for tests, server-side rendering, and as a default fallback when no
 * platform-specific storage is available. Tokens are lost on process exit.
 */
export class InMemoryTokenStorage implements TokenStorage {
  private tokens: AuthTokens | null = null;

  read(): Promise<AuthTokens | null> {
    return Promise.resolve(this.tokens);
  }

  write(tokens: AuthTokens): Promise<void> {
    this.tokens = tokens;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.tokens = null;
    return Promise.resolve();
  }
}
