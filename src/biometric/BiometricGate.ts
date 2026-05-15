/**
 * Subset of `expo-local-authentication` we use, abstracted so the package
 * itself never imports `expo-local-authentication`.
 *
 * Mobile consumers wire this up at the edge:
 *
 * ```ts
 * import * as LocalAuthentication from 'expo-local-authentication';
 * const adapter: LocalAuthLike = {
 *   hasHardwareAsync: LocalAuthentication.hasHardwareAsync,
 *   isEnrolledAsync: LocalAuthentication.isEnrolledAsync,
 *   authenticateAsync: (opts) => LocalAuthentication.authenticateAsync(opts),
 * };
 * ```
 */
export interface LocalAuthLike {
  hasHardwareAsync(): Promise<boolean>;
  isEnrolledAsync(): Promise<boolean>;
  authenticateAsync(options?: {
    promptMessage?: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
  }): Promise<{ success: boolean; error?: string }>;
}

/**
 * Optional persistence so the "enabled" flag survives app restart. Backed by
 * any `TokenStorage`-shaped key/value store via the calling consumer (or the
 * app's settings store). We keep it pluggable to avoid coupling
 * `BiometricGate` to a specific storage adapter.
 */
export interface BiometricFlagStore {
  read(): Promise<boolean>;
  write(enabled: boolean): Promise<void>;
}

export interface BiometricGateOptions {
  localAuth: LocalAuthLike;
  /** Optional persistence for the user's opt-in choice. */
  flagStore?: BiometricFlagStore;
  /** Default prompt message; consumers usually override. */
  promptMessage?: string;
  /** Max consecutive prompt failures before {@link unlock} throws. Default 3. */
  maxFailures?: number;
}

const DEFAULT_PROMPT = 'Unlock to continue';
const DEFAULT_MAX_FAILURES = 3;

/**
 * Biometric gate wrapping `expo-local-authentication`.
 *
 * Lifecycle:
 *
 * 1. `isAvailable()` — checks hardware + enrolment. Pure read.
 * 2. `setEnabled(true|false)` — consumer's settings UI flips this. Persisted
 *    via the optional flag store. Default = disabled (opt-in).
 * 3. `unlock()` — called by `SecureStoreTokenStorage` (when wired) or by
 *    consumer code before sensitive operations. Counts consecutive failures;
 *    after `maxFailures` (default 3), throws `BiometricLockedOutError` and
 *    consumers MUST navigate to login.
 * 4. `prompt()` — one-shot biometric prompt that doesn't change the failure
 *    counter. Useful for re-confirming an action mid-session.
 *
 * The failure counter resets on success.
 */
export class BiometricGate {
  private readonly localAuth: LocalAuthLike;
  private readonly flagStore: BiometricFlagStore | undefined;
  private readonly promptMessage: string;
  private readonly maxFailures: number;
  private enabled: boolean = false;
  private failureCount: number = 0;
  private hydrated: boolean = false;

  constructor(options: BiometricGateOptions) {
    this.localAuth = options.localAuth;
    this.flagStore = options.flagStore;
    this.promptMessage = options.promptMessage ?? DEFAULT_PROMPT;
    this.maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
  }

  /** Hardware present AND a fingerprint/face ID is enrolled. */
  async isAvailable(): Promise<boolean> {
    const hasHardware = await this.localAuth.hasHardwareAsync();
    if (!hasHardware) {
      return false;
    }
    return this.localAuth.isEnrolledAsync();
  }

  /** Synchronous read of the current enabled flag (post-hydration). */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Read the persisted opt-in flag once at app boot. Idempotent. */
  async hydrate(): Promise<void> {
    if (this.hydrated) {
      return;
    }
    this.hydrated = true;
    if (this.flagStore !== undefined) {
      this.enabled = await this.flagStore.read();
    }
  }

  /**
   * Toggle biometric requirement. Persists via {@link BiometricFlagStore} when
   * configured. Resets the failure counter so a re-enable starts fresh.
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    this.failureCount = 0;
    if (this.flagStore !== undefined) {
      await this.flagStore.write(enabled);
    }
  }

  /** Reset the failure counter. Tests + consumer recovery flows. */
  resetFailures(): void {
    this.failureCount = 0;
  }

  /**
   * One-shot biometric prompt. Returns `true` on success. Does NOT throw on
   * failure or update the failure counter — useful for action confirmation.
   */
  async prompt(): Promise<boolean> {
    const result = await this.localAuth.authenticateAsync({
      promptMessage: this.promptMessage,
    });
    return result.success;
  }

  /**
   * Required pre-condition for sensitive token reads. No-op when disabled.
   *
   * @throws Error after {@link maxFailures} consecutive failures.
   * @throws Error on a single failure (lower in the count, but still throws so
   *   `SecureStoreTokenStorage.read()` short-circuits).
   */
  async unlock(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const result = await this.localAuth.authenticateAsync({
      promptMessage: this.promptMessage,
    });
    if (result.success) {
      this.failureCount = 0;
      return;
    }
    this.failureCount += 1;
    if (this.failureCount >= this.maxFailures) {
      throw new Error('Biometric authentication failed; locked out');
    }
    throw new Error('Biometric authentication failed');
  }
}
