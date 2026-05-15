/**
 * Tiny dependency-free event emitter for auth lifecycle events.
 *
 * Consumers subscribe to `onSessionExpired` to navigate to the login screen
 * when refresh fails or the inactivity timeout fires. We don't reach for
 * `EventTarget`/`EventEmitter` because we want one consistent API across web,
 * React Native, and node test environments without polyfills.
 */
export type AuthEventName = 'sessionExpired';

export type AuthEventListener = () => void;

export interface AuthEventUnsubscribe {
  (): void;
}

export class AuthEventEmitter {
  private readonly listeners: Map<AuthEventName, Set<AuthEventListener>> = new Map();

  on(event: AuthEventName, listener: AuthEventListener): AuthEventUnsubscribe {
    let bucket = this.listeners.get(event);
    if (bucket === undefined) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    bucket.add(listener);
    return (): void => {
      const current = this.listeners.get(event);
      if (current !== undefined) {
        current.delete(listener);
      }
    };
  }

  emit(event: AuthEventName): void {
    const bucket = this.listeners.get(event);
    if (bucket === undefined) {
      return;
    }
    // Snapshot so listeners can unsubscribe during dispatch without skipping siblings.
    const snapshot = Array.from(bucket);
    for (const listener of snapshot) {
      listener();
    }
  }

  /** Remove all listeners. Useful for `AuthClient.dispose()` and tests. */
  clear(): void {
    this.listeners.clear();
  }
}
