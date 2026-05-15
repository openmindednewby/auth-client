import {
  SecureStoreTokenStorage,
  type BiometricGateLike,
  type SecureStoreLike,
} from './SecureStoreTokenStorage';

import type { AuthTokens } from '../types/AuthTokens';

const TOKENS: AuthTokens = {
  accessToken: 'access',
  refreshToken: 'refresh',
  idToken: 'id',
  expiresAt: 1_700_000_000_000,
};

interface MockResult {
  store: SecureStoreLike;
  data: Map<string, string>;
  getCalls: Array<{ key: string; options: { requireAuthentication?: boolean } | undefined }>;
}

function createMockSecureStore(initial: Record<string, string> = {}): MockResult {
  const data = new Map<string, string>(Object.entries(initial));
  const getCalls: MockResult['getCalls'] = [];
  const store: SecureStoreLike = {
    getItemAsync: (key, options) => {
      getCalls.push({ key, options });
      return Promise.resolve(data.has(key) ? (data.get(key) as string) : null);
    },
    setItemAsync: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    deleteItemAsync: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
  return { store, data, getCalls };
}

describe('SecureStoreTokenStorage', () => {
  it('returns null when no access token is stored', async () => {
    const mock = createMockSecureStore();
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    expect(await storage.read()).toBeNull();
  });

  it('round-trips tokens through write + read', async () => {
    const mock = createMockSecureStore();
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    await storage.write(TOKENS);
    expect(await storage.read()).toEqual(TOKENS);
  });

  it('uses default key prefix `auth`', async () => {
    const mock = createMockSecureStore();
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    await storage.write(TOKENS);
    expect(mock.data.get('auth.access')).toBe('access');
    expect(mock.data.get('auth.refresh')).toBe('refresh');
    expect(mock.data.get('auth.id')).toBe('id');
    expect(mock.data.get('auth.expiresAt')).toBe('1700000000000');
  });

  it('respects custom keyPrefix', async () => {
    const mock = createMockSecureStore();
    const storage = new SecureStoreTokenStorage({
      secureStore: mock.store,
      keyPrefix: 'mybiz',
    });
    await storage.write(TOKENS);
    expect(mock.data.get('mybiz.access')).toBe('access');
  });

  it('passes requireAuthentication option to read calls when configured', async () => {
    const mock = createMockSecureStore({
      'auth.access': 'access',
      'auth.refresh': 'refresh',
      'auth.id': 'id',
      'auth.expiresAt': '1',
    });
    const storage = new SecureStoreTokenStorage({
      secureStore: mock.store,
      requireAuthentication: true,
    });
    await storage.read();
    const accessCall = mock.getCalls.find((c) => c.key === 'auth.access');
    const refreshCall = mock.getCalls.find((c) => c.key === 'auth.refresh');
    const idCall = mock.getCalls.find((c) => c.key === 'auth.id');
    expect(accessCall?.options).toEqual({ requireAuthentication: true });
    expect(refreshCall?.options).toEqual({ requireAuthentication: true });
    // idToken is non-sensitive — read without auth requirement.
    expect(idCall?.options).toBeUndefined();
  });

  it('omits requireAuthentication option when not configured', async () => {
    const mock = createMockSecureStore({
      'auth.access': 'access',
      'auth.expiresAt': '1',
    });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    await storage.read();
    const accessCall = mock.getCalls.find((c) => c.key === 'auth.access');
    expect(accessCall?.options).toBeUndefined();
  });

  it('write deletes refresh slot when refreshToken is undefined', async () => {
    const mock = createMockSecureStore({ 'auth.refresh': 'old' });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    await storage.write({ accessToken: 'a', expiresAt: 1 });
    expect(mock.data.has('auth.refresh')).toBe(false);
  });

  it('write deletes refresh slot when refreshToken is empty string', async () => {
    const mock = createMockSecureStore({ 'auth.refresh': 'old' });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    await storage.write({ accessToken: 'a', refreshToken: '', expiresAt: 1 });
    expect(mock.data.has('auth.refresh')).toBe(false);
  });

  it('write deletes id slot when idToken is undefined', async () => {
    const mock = createMockSecureStore({ 'auth.id': 'old' });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    await storage.write({ accessToken: 'a', expiresAt: 1 });
    expect(mock.data.has('auth.id')).toBe(false);
  });

  it('write deletes id slot when idToken is empty string', async () => {
    const mock = createMockSecureStore({ 'auth.id': 'old' });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    await storage.write({ accessToken: 'a', idToken: '', expiresAt: 1 });
    expect(mock.data.has('auth.id')).toBe(false);
  });

  it('clear removes all four slots', async () => {
    const mock = createMockSecureStore();
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    await storage.write(TOKENS);
    await storage.clear();
    expect(mock.data.size).toBe(0);
  });

  it('returns expiresAt of 0 when stored value is empty', async () => {
    const mock = createMockSecureStore({
      'auth.access': 'a',
      'auth.expiresAt': '',
    });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    const tokens = await storage.read();
    expect(tokens?.expiresAt).toBe(0);
  });

  it('returns expiresAt of 0 when stored value is non-numeric', async () => {
    const mock = createMockSecureStore({
      'auth.access': 'a',
      'auth.expiresAt': 'NaN',
    });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    const tokens = await storage.read();
    expect(tokens?.expiresAt).toBe(0);
  });

  it('returns expiresAt of 0 when slot is missing entirely', async () => {
    const mock = createMockSecureStore({ 'auth.access': 'a' });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    const tokens = await storage.read();
    expect(tokens?.expiresAt).toBe(0);
  });

  it('returns undefined refresh/id when slots are absent', async () => {
    const mock = createMockSecureStore({
      'auth.access': 'a',
      'auth.expiresAt': '1',
    });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    const tokens = await storage.read();
    expect(tokens?.refreshToken).toBeUndefined();
    expect(tokens?.idToken).toBeUndefined();
  });

  it('runs biometric gate before read when gate is enabled', async () => {
    const unlock = jest.fn().mockResolvedValue(undefined);
    const gate: BiometricGateLike = {
      unlock,
      isEnabled: () => true,
    };
    const mock = createMockSecureStore({
      'auth.access': 'a',
      'auth.expiresAt': '1',
    });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store, biometricGate: gate });
    await storage.read();
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('skips biometric gate when gate reports disabled', async () => {
    const unlock = jest.fn();
    const gate: BiometricGateLike = {
      unlock,
      isEnabled: () => false,
    };
    const mock = createMockSecureStore({
      'auth.access': 'a',
      'auth.expiresAt': '1',
    });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store, biometricGate: gate });
    await storage.read();
    expect(unlock).not.toHaveBeenCalled();
  });

  it('skips biometric gate when no gate is configured', async () => {
    const mock = createMockSecureStore({
      'auth.access': 'a',
      'auth.expiresAt': '1',
    });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store });
    expect(await storage.read()).toBeTruthy();
  });

  it('propagates biometric gate failure', async () => {
    const gate: BiometricGateLike = {
      unlock: () => Promise.reject(new Error('biometric denied')),
      isEnabled: () => true,
    };
    const mock = createMockSecureStore({
      'auth.access': 'a',
      'auth.expiresAt': '1',
    });
    const storage = new SecureStoreTokenStorage({ secureStore: mock.store, biometricGate: gate });
    await expect(storage.read()).rejects.toThrow('biometric denied');
  });
});
