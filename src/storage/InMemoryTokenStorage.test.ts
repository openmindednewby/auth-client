import { InMemoryTokenStorage } from './InMemoryTokenStorage';

import type { AuthTokens } from '../types/AuthTokens';

const TOKENS: AuthTokens = { accessToken: 'a', refreshToken: 'r', expiresAt: 1_000 };

describe('InMemoryTokenStorage', () => {
  it('starts empty', async () => {
    const storage = new InMemoryTokenStorage();
    expect(await storage.read()).toBeNull();
  });

  it('persists a write across reads', async () => {
    const storage = new InMemoryTokenStorage();
    await storage.write(TOKENS);
    expect(await storage.read()).toEqual(TOKENS);
    expect(await storage.read()).toEqual(TOKENS);
  });

  it('overwrites previous tokens', async () => {
    const storage = new InMemoryTokenStorage();
    await storage.write(TOKENS);
    const updated: AuthTokens = { ...TOKENS, accessToken: 'b' };
    await storage.write(updated);
    expect(await storage.read()).toEqual(updated);
  });

  it('clear() removes the persisted tokens', async () => {
    const storage = new InMemoryTokenStorage();
    await storage.write(TOKENS);
    await storage.clear();
    expect(await storage.read()).toBeNull();
  });

  it('clear() is safe on empty storage', async () => {
    const storage = new InMemoryTokenStorage();
    await storage.clear();
    expect(await storage.read()).toBeNull();
  });
});
