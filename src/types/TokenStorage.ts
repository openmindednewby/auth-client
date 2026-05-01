import type { AuthTokens } from './AuthTokens';

/**
 * Pluggable token persistence.
 *
 * Consumers (web, native, server-side) provide an implementation tailored to
 * their platform: `localStorage`, `sessionStorage`, `expo-secure-store`,
 * `AsyncStorage`, or an in-memory map for tests. Keeping the interface narrow
 * (read / write / clear) keeps the package transport-agnostic.
 */
export interface TokenStorage {
  read(): Promise<AuthTokens | null>;
  write(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}
