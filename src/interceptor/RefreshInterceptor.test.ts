import { AuthEventEmitter } from '../events/AuthEventEmitter';
import { InMemoryTokenStorage } from '../storage/InMemoryTokenStorage';
import { RefreshInterceptor, type RefreshFn } from './RefreshInterceptor';

import type { AuthTokens } from '../types/AuthTokens';

const SEED: AuthTokens = { accessToken: 'old', refreshToken: 'r', expiresAt: 1 };
const FRESH: AuthTokens = { accessToken: 'new', refreshToken: 'r2', expiresAt: 2 };

interface Wiring {
  storage: InMemoryTokenStorage;
  events: AuthEventEmitter;
  expiredListener: jest.Mock;
  successListener: jest.Mock;
}

function buildWiring(): Wiring {
  const storage = new InMemoryTokenStorage();
  const events = new AuthEventEmitter();
  const expiredListener = jest.fn();
  events.on('sessionExpired', expiredListener);
  const successListener = jest.fn();
  return { storage, events, expiredListener, successListener };
}

describe('RefreshInterceptor.refreshTokens', () => {
  it('persists new tokens on success and returns them', async () => {
    const wiring = buildWiring();
    await wiring.storage.write(SEED);
    const refresh: RefreshFn = jest.fn().mockResolvedValue(FRESH);
    const interceptor = new RefreshInterceptor({
      storage: wiring.storage,
      events: wiring.events,
      refresh,
      onRefreshSuccess: wiring.successListener,
    });
    const result = await interceptor.refreshTokens();
    expect(result).toEqual(FRESH);
    expect(await wiring.storage.read()).toEqual(FRESH);
    expect(wiring.successListener).toHaveBeenCalledWith(FRESH);
    expect(wiring.expiredListener).not.toHaveBeenCalled();
  });

  it('passes the current tokens to the refresh fn', async () => {
    const wiring = buildWiring();
    await wiring.storage.write(SEED);
    const refresh: RefreshFn = jest.fn().mockResolvedValue(FRESH);
    const interceptor = new RefreshInterceptor({
      storage: wiring.storage,
      events: wiring.events,
      refresh,
    });
    await interceptor.refreshTokens();
    expect(refresh).toHaveBeenCalledWith(SEED);
  });

  it('passes null when no tokens are stored (cookie-storage case)', async () => {
    const wiring = buildWiring();
    const refresh: RefreshFn = jest.fn().mockResolvedValue(FRESH);
    const interceptor = new RefreshInterceptor({
      storage: wiring.storage,
      events: wiring.events,
      refresh,
    });
    await interceptor.refreshTokens();
    expect(refresh).toHaveBeenCalledWith(null);
  });

  it('clears storage and emits sessionExpired when refresh returns null', async () => {
    const wiring = buildWiring();
    await wiring.storage.write(SEED);
    const refresh: RefreshFn = jest.fn().mockResolvedValue(null);
    const interceptor = new RefreshInterceptor({
      storage: wiring.storage,
      events: wiring.events,
      refresh,
    });
    const result = await interceptor.refreshTokens();
    expect(result).toBeNull();
    expect(await wiring.storage.read()).toBeNull();
    expect(wiring.expiredListener).toHaveBeenCalledTimes(1);
  });

  it('clears storage and emits sessionExpired when refresh throws', async () => {
    const wiring = buildWiring();
    await wiring.storage.write(SEED);
    const refresh: RefreshFn = jest.fn().mockRejectedValue(new Error('network'));
    const interceptor = new RefreshInterceptor({
      storage: wiring.storage,
      events: wiring.events,
      refresh,
    });
    const result = await interceptor.refreshTokens();
    expect(result).toBeNull();
    expect(await wiring.storage.read()).toBeNull();
    expect(wiring.expiredListener).toHaveBeenCalledTimes(1);
  });

  it('does not call onRefreshSuccess when refresh fails', async () => {
    const wiring = buildWiring();
    const refresh: RefreshFn = jest.fn().mockResolvedValue(null);
    const interceptor = new RefreshInterceptor({
      storage: wiring.storage,
      events: wiring.events,
      refresh,
      onRefreshSuccess: wiring.successListener,
    });
    await interceptor.refreshTokens();
    expect(wiring.successListener).not.toHaveBeenCalled();
  });

  it('works without an onRefreshSuccess callback', async () => {
    const wiring = buildWiring();
    const refresh: RefreshFn = jest.fn().mockResolvedValue(FRESH);
    const interceptor = new RefreshInterceptor({
      storage: wiring.storage,
      events: wiring.events,
      refresh,
    });
    const result = await interceptor.refreshTokens();
    expect(result).toEqual(FRESH);
  });

  it('coalesces concurrent calls into a single refresh (single-flight)', async () => {
    const wiring = buildWiring();
    await wiring.storage.write(SEED);
    let resolveRefresh: ((tokens: AuthTokens) => void) | undefined;
    const refresh: RefreshFn = jest.fn().mockImplementation(
      () =>
        new Promise<AuthTokens>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const interceptor = new RefreshInterceptor({
      storage: wiring.storage,
      events: wiring.events,
      refresh,
    });
    const a = interceptor.refreshTokens();
    const b = interceptor.refreshTokens();
    const c = interceptor.refreshTokens();
    expect(interceptor.isRefreshing).toBe(true);
    // Yield to the microtask queue so the async refresh implementation runs.
    await new Promise((resolve) => setImmediate(resolve));
    expect(refresh).toHaveBeenCalledTimes(1);
    if (resolveRefresh === undefined) {
      throw new Error('refresh was not called');
    }
    resolveRefresh(FRESH);
    const [r1, r2, r3] = await Promise.all([a, b, c]);
    expect(r1).toEqual(FRESH);
    expect(r2).toEqual(FRESH);
    expect(r3).toEqual(FRESH);
    expect(interceptor.isRefreshing).toBe(false);
  });

  it('allows a second refresh after the first completes', async () => {
    const wiring = buildWiring();
    const refresh: RefreshFn = jest
      .fn()
      .mockResolvedValueOnce(FRESH)
      .mockResolvedValueOnce({ ...FRESH, accessToken: 'newer' });
    const interceptor = new RefreshInterceptor({
      storage: wiring.storage,
      events: wiring.events,
      refresh,
    });
    const r1 = await interceptor.refreshTokens();
    expect(r1?.accessToken).toBe('new');
    const r2 = await interceptor.refreshTokens();
    expect(r2?.accessToken).toBe('newer');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('isRefreshing is false before any refresh starts', () => {
    const wiring = buildWiring();
    const refresh: RefreshFn = jest.fn();
    const interceptor = new RefreshInterceptor({
      storage: wiring.storage,
      events: wiring.events,
      refresh,
    });
    expect(interceptor.isRefreshing).toBe(false);
  });

  it('emits sessionExpired exactly once even when joined by N concurrent waiters', async () => {
    const wiring = buildWiring();
    let resolveRefresh: ((value: AuthTokens | null) => void) | undefined;
    const refresh: RefreshFn = jest.fn().mockImplementation(
      () =>
        new Promise<AuthTokens | null>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const interceptor = new RefreshInterceptor({
      storage: wiring.storage,
      events: wiring.events,
      refresh,
    });
    const promises = [interceptor.refreshTokens(), interceptor.refreshTokens(), interceptor.refreshTokens()];
    await new Promise((resolve) => setImmediate(resolve));
    if (resolveRefresh === undefined) {
      throw new Error('refresh was not called');
    }
    resolveRefresh(null);
    await Promise.all(promises);
    expect(wiring.expiredListener).toHaveBeenCalledTimes(1);
  });
});
