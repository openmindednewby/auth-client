import { BrowserStorageTokenStorage, type StorageLike } from './BrowserStorageTokenStorage';

import type { AuthTokens } from '../types/AuthTokens';

const TOKENS: AuthTokens = { accessToken: 'a', refreshToken: 'r', expiresAt: 1_000 };

function createMockStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string): string | null => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
  };
}

describe('BrowserStorageTokenStorage', () => {
  it('returns null when storage has no entry under the key', async () => {
    const storage = new BrowserStorageTokenStorage({ storage: createMockStorage() });
    expect(await storage.read()).toBeNull();
  });

  it('returns null when stored value is empty string', async () => {
    const backend = createMockStorage({ 'auth.tokens': '' });
    const storage = new BrowserStorageTokenStorage({ storage: backend });
    expect(await storage.read()).toBeNull();
  });

  it('returns null when stored JSON is malformed', async () => {
    const backend = createMockStorage({ 'auth.tokens': '{not json' });
    const storage = new BrowserStorageTokenStorage({ storage: backend });
    expect(await storage.read()).toBeNull();
  });

  it('returns null when stored payload is not a token shape', async () => {
    const backend = createMockStorage({ 'auth.tokens': JSON.stringify({ foo: 'bar' }) });
    const storage = new BrowserStorageTokenStorage({ storage: backend });
    expect(await storage.read()).toBeNull();
  });

  it('returns null when stored payload is a JSON primitive', async () => {
    const backend = createMockStorage({ 'auth.tokens': '42' });
    const storage = new BrowserStorageTokenStorage({ storage: backend });
    expect(await storage.read()).toBeNull();
  });

  it('round-trips a write through read', async () => {
    const storage = new BrowserStorageTokenStorage({ storage: createMockStorage() });
    await storage.write(TOKENS);
    expect(await storage.read()).toEqual(TOKENS);
  });

  it('clears the stored entry', async () => {
    const storage = new BrowserStorageTokenStorage({ storage: createMockStorage() });
    await storage.write(TOKENS);
    await storage.clear();
    expect(await storage.read()).toBeNull();
  });

  it('uses a custom key when provided', async () => {
    const backend = createMockStorage();
    const storage = new BrowserStorageTokenStorage({ storage: backend, key: 'custom-key' });
    await storage.write(TOKENS);
    expect(backend.getItem('custom-key')).toContain('accessToken');
    expect(backend.getItem('auth.tokens')).toBeNull();
  });

  it('returns null when the underlying getItem throws', async () => {
    const backend: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    const storage = new BrowserStorageTokenStorage({ storage: backend });
    expect(await storage.read()).toBeNull();
  });

  it('propagates errors thrown by setItem', () => {
    const backend: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: jest.fn(),
    };
    const storage = new BrowserStorageTokenStorage({ storage: backend });
    expect(() => storage.write(TOKENS)).toThrow('quota');
  });

  it('propagates errors thrown by removeItem', () => {
    const backend: StorageLike = {
      getItem: () => null,
      setItem: jest.fn(),
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const storage = new BrowserStorageTokenStorage({ storage: backend });
    expect(() => storage.clear()).toThrow('denied');
  });
});
