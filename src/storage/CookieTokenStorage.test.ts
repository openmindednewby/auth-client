import { CookieTokenStorage } from './CookieTokenStorage';

import type { AuthTokens } from '../types/AuthTokens';

const TOKENS: AuthTokens = {
  accessToken: 'access',
  refreshToken: 'should-not-survive',
  idToken: 'id',
  expiresAt: 1_000_000,
};

describe('CookieTokenStorage', () => {
  it('returns null when no access token has been written', async () => {
    const storage = new CookieTokenStorage();
    expect(await storage.read()).toBeNull();
  });

  it('round-trips access token and idToken via read/write', async () => {
    const storage = new CookieTokenStorage();
    await storage.write(TOKENS);
    const read = await storage.read();
    expect(read).not.toBeNull();
    expect(read?.accessToken).toBe('access');
    expect(read?.idToken).toBe('id');
    expect(read?.expiresAt).toBe(1_000_000);
  });

  it('drops the refresh token on write — refresh material lives in httpOnly cookie only', async () => {
    const storage = new CookieTokenStorage();
    await storage.write(TOKENS);
    const read = await storage.read();
    expect(read?.refreshToken).toBeUndefined();
  });

  it('preserves undefined idToken when not provided', async () => {
    const storage = new CookieTokenStorage();
    await storage.write({ accessToken: 'a', expiresAt: 1 });
    const read = await storage.read();
    expect(read?.idToken).toBeUndefined();
  });

  it('clear() resets to "no token" state', async () => {
    const storage = new CookieTokenStorage();
    await storage.write(TOKENS);
    await storage.clear();
    expect(await storage.read()).toBeNull();
  });

  it('subsequent writes overwrite prior values', async () => {
    const storage = new CookieTokenStorage();
    await storage.write(TOKENS);
    await storage.write({ accessToken: 'second', expiresAt: 2_000 });
    const read = await storage.read();
    expect(read?.accessToken).toBe('second');
    expect(read?.expiresAt).toBe(2_000);
    expect(read?.idToken).toBeUndefined();
  });
});
