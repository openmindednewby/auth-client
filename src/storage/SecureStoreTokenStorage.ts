import type { AuthTokens } from '../types/AuthTokens';
import type { TokenStorage } from '../types/TokenStorage';

/**
 * Subset of `expo-secure-store` we use, abstracted so the package itself never
 * imports `expo-secure-store` (and so web bundles never pull it in).
 *
 * Mobile consumers wire this up at the edge:
 *
 * ```ts
 * import * as SecureStore from 'expo-secure-store';
 * const adapter: SecureStoreLike = {
 *   getItemAsync: SecureStore.getItemAsync,
 *   setItemAsync: SecureStore.setItemAsync,
 *   deleteItemAsync: SecureStore.deleteItemAsync,
 * };
 * ```
 */
export interface SecureStoreLike {
  getItemAsync(key: string, options?: { requireAuthentication?: boolean }): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: { requireAuthentication?: boolean }): Promise<void>;
  deleteItemAsync(key: string, options?: { requireAuthentication?: boolean }): Promise<void>;
}

/**
 * Optional biometric gate. When provided AND `requireBiometric` is `true`, the
 * gate's `unlock()` is called before reading the refresh token. Used by mobile
 * consumers that opt in to biometric-protected sessions.
 */
export interface BiometricGateLike {
  unlock(): Promise<void>;
  isEnabled(): boolean;
}

export interface SecureStoreTokenStorageOptions {
  secureStore: SecureStoreLike;
  /** Defaults applied to every key — usually `'auth'`. */
  keyPrefix?: string;
  /**
   * When true, secure-store reads use `requireAuthentication: true`, prompting
   * the OS biometric / device-passcode dialog (iOS Keychain access control,
   * Android Keystore strongbox).
   */
  requireAuthentication?: boolean;
  /**
   * Optional biometric gate run BEFORE the secure-store read. Belt-and-braces
   * with `requireAuthentication`: the gate enforces our own retry/lockout
   * semantics, while `requireAuthentication` enforces the OS keychain ACL.
   */
  biometricGate?: BiometricGateLike;
}

const DEFAULT_PREFIX = 'auth';
const ACCESS_KEY = 'access';
const REFRESH_KEY = 'refresh';
const ID_KEY = 'id';
const EXPIRES_KEY = 'expiresAt';

/**
 * Persist tokens in iOS Keychain / Android Keystore via `expo-secure-store`.
 *
 * Keys are split (access / refresh / id / expiresAt) rather than stored as a
 * single JSON blob so the OS-level ACL on the refresh token slot can be
 * tightened independently. With `requireAuthentication: true`, reads of any
 * key trigger the OS biometric prompt — that's why we keep it OFF for writes
 * (login flows must not prompt) and ON for reads (boot-time session restore).
 *
 * Storage key shape: `{prefix}.{slot}` (e.g. `auth.refresh`).
 */
export class SecureStoreTokenStorage implements TokenStorage {
  private readonly secureStore: SecureStoreLike;
  private readonly prefix: string;
  private readonly requireAuthentication: boolean;
  private readonly biometricGate: BiometricGateLike | undefined;

  constructor(options: SecureStoreTokenStorageOptions) {
    this.secureStore = options.secureStore;
    this.prefix = options.keyPrefix ?? DEFAULT_PREFIX;
    this.requireAuthentication = options.requireAuthentication ?? false;
    this.biometricGate = options.biometricGate;
  }

  async read(): Promise<AuthTokens | null> {
    if (this.shouldRunBiometricGate()) {
      // Biometric gate may throw — let it propagate. Caller (RefreshInterceptor
      // / AuthClient.init) will treat that as a failed restore and clear.
      await (this.biometricGate as BiometricGateLike).unlock();
    }
    const readOptions = this.requireAuthentication ? { requireAuthentication: true } : undefined;
    const accessToken = await this.secureStore.getItemAsync(this.fullKey(ACCESS_KEY), readOptions);
    if (accessToken === null) {
      return null;
    }
    const refreshTokenRaw = await this.secureStore.getItemAsync(this.fullKey(REFRESH_KEY), readOptions);
    const idTokenRaw = await this.secureStore.getItemAsync(this.fullKey(ID_KEY));
    const expiresAtRaw = await this.secureStore.getItemAsync(this.fullKey(EXPIRES_KEY));
    const expiresAt = parseExpiresAt(expiresAtRaw);
    return {
      accessToken,
      refreshToken: refreshTokenRaw === null ? undefined : refreshTokenRaw,
      idToken: idTokenRaw === null ? undefined : idTokenRaw,
      expiresAt,
    };
  }

  async write(tokens: AuthTokens): Promise<void> {
    await this.secureStore.setItemAsync(this.fullKey(ACCESS_KEY), tokens.accessToken);
    if (tokens.refreshToken !== undefined && tokens.refreshToken !== '') {
      await this.secureStore.setItemAsync(this.fullKey(REFRESH_KEY), tokens.refreshToken);
    } else {
      await this.secureStore.deleteItemAsync(this.fullKey(REFRESH_KEY));
    }
    if (tokens.idToken !== undefined && tokens.idToken !== '') {
      await this.secureStore.setItemAsync(this.fullKey(ID_KEY), tokens.idToken);
    } else {
      await this.secureStore.deleteItemAsync(this.fullKey(ID_KEY));
    }
    await this.secureStore.setItemAsync(this.fullKey(EXPIRES_KEY), String(tokens.expiresAt));
  }

  async clear(): Promise<void> {
    await this.secureStore.deleteItemAsync(this.fullKey(ACCESS_KEY));
    await this.secureStore.deleteItemAsync(this.fullKey(REFRESH_KEY));
    await this.secureStore.deleteItemAsync(this.fullKey(ID_KEY));
    await this.secureStore.deleteItemAsync(this.fullKey(EXPIRES_KEY));
  }

  private shouldRunBiometricGate(): boolean {
    return this.biometricGate !== undefined && this.biometricGate.isEnabled();
  }

  private fullKey(slot: string): string {
    return `${this.prefix}.${slot}`;
  }
}

function parseExpiresAt(raw: string | null): number {
  if (raw === null || raw === '') {
    return 0;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
