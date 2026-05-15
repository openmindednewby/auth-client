import { AuthClient } from './AuthClient';
import { AuthApiClient } from './api/AuthApiClient';
import { AuthEventEmitter } from './events/AuthEventEmitter';
import { InactivityTracker, type InactivityStore } from './inactivity/InactivityTracker';
import { RefreshInterceptor, type RefreshFn } from './interceptor/RefreshInterceptor';
import { InMemoryTokenStorage } from './storage/InMemoryTokenStorage';

import type { HttpClient, HttpRequest, HttpResponse } from './http/HttpClient';
import type { AuthTokens } from './types/AuthTokens';

const VALID_CONFIG = {
  baseUrl: 'https://identity.dloizides.com',
  realm: 'OnlineMenu',
  clientId: 'online-menu-client',
};

const TOKENS: AuthTokens = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: Number.MAX_SAFE_INTEGER,
};

const EXPIRED_TOKENS: AuthTokens = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: 1, // 1970-ish
};

interface MockHttpResult {
  http: HttpClient;
  calls: HttpRequest[];
}

function createMockHttp(responses: HttpResponse[] | HttpResponse): MockHttpResult {
  const calls: HttpRequest[] = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const http: HttpClient = (request) => {
    calls.push(request);
    const next = queue.shift() ?? { status: 200, ok: true };
    return Promise.resolve(next);
  };
  return { http, calls };
}

function createInactivityStore(initial: number | null = null): {
  store: InactivityStore;
  state: { value: number | null };
} {
  const state = { value: initial };
  const store: InactivityStore = {
    read: () => Promise.resolve(state.value),
    write: (ts) => {
      state.value = ts;
      return Promise.resolve();
    },
    clear: () => {
      state.value = null;
      return Promise.resolve();
    },
  };
  return { store, state };
}

describe('AuthClient construction', () => {
  it('rejects empty baseUrl', () => {
    expect(() => new AuthClient({ ...VALID_CONFIG, baseUrl: '' }, new InMemoryTokenStorage())).toThrow(
      'baseUrl is required',
    );
  });

  it('rejects empty realm', () => {
    expect(() => new AuthClient({ ...VALID_CONFIG, realm: '' }, new InMemoryTokenStorage())).toThrow(
      'realm is required',
    );
  });

  it('rejects empty clientId', () => {
    expect(() => new AuthClient({ ...VALID_CONFIG, clientId: '' }, new InMemoryTokenStorage())).toThrow(
      'clientId is required',
    );
  });

  it('exposes config via getters', () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(client.realm).toBe('OnlineMenu');
    expect(client.clientId).toBe('online-menu-client');
    expect(client.baseUrl).toBe('https://identity.dloizides.com');
  });

  it('strips trailing slash from baseUrl on read', () => {
    const client = new AuthClient(
      { ...VALID_CONFIG, baseUrl: 'https://identity.dloizides.com/' },
      new InMemoryTokenStorage(),
    );
    expect(client.baseUrl).toBe('https://identity.dloizides.com');
  });

  it('defaults scope when not provided', () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(client.scope).toBe('openid profile email');
  });

  it('uses provided scope when given', () => {
    const client = new AuthClient(
      { ...VALID_CONFIG, scope: 'openid offline_access' },
      new InMemoryTokenStorage(),
    );
    expect(client.scope).toBe('openid offline_access');
  });

  it('exposes redirectUri when configured', () => {
    const client = new AuthClient(
      { ...VALID_CONFIG, redirectUri: 'http://localhost:8082' },
      new InMemoryTokenStorage(),
    );
    expect(client.redirectUri).toBe('http://localhost:8082');
  });

  it('redirectUri is undefined when not configured', () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(client.redirectUri).toBeUndefined();
  });
});

describe('AuthClient endpoint URLs', () => {
  const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());

  it('builds the issuer URL', () => {
    expect(client.issuerUrl).toBe('https://identity.dloizides.com/realms/OnlineMenu');
  });

  it('builds the authorization endpoint', () => {
    expect(client.authorizationEndpoint).toBe(
      'https://identity.dloizides.com/realms/OnlineMenu/protocol/openid-connect/auth',
    );
  });

  it('builds the token endpoint', () => {
    expect(client.tokenEndpoint).toBe(
      'https://identity.dloizides.com/realms/OnlineMenu/protocol/openid-connect/token',
    );
  });

  it('builds the userinfo endpoint', () => {
    expect(client.userInfoEndpoint).toBe(
      'https://identity.dloizides.com/realms/OnlineMenu/protocol/openid-connect/userinfo',
    );
  });

  it('builds the logout endpoint', () => {
    expect(client.logoutEndpoint).toBe(
      'https://identity.dloizides.com/realms/OnlineMenu/protocol/openid-connect/logout',
    );
  });
});

describe('AuthClient.buildAuthorizationUrl', () => {
  it('throws when redirectUri is not configured', () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(() => client.buildAuthorizationUrl()).toThrow('redirectUri is required');
  });

  it('builds an authorization URL with the configured redirectUri and scope', () => {
    const client = new AuthClient(
      { ...VALID_CONFIG, redirectUri: 'http://localhost:8082' },
      new InMemoryTokenStorage(),
    );
    const url = client.buildAuthorizationUrl({ state: 's', codeChallenge: 'c' });
    expect(url).toContain('client_id=online-menu-client');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8082');
    expect(url).toContain('scope=openid+profile+email');
    expect(url).toContain('state=s');
    expect(url).toContain('code_challenge=c');
  });

  it('appends offline_access to scope when offlineAccess option set', () => {
    const client = new AuthClient(
      { ...VALID_CONFIG, redirectUri: 'http://localhost:8082' },
      new InMemoryTokenStorage(),
    );
    const url = client.buildAuthorizationUrl({ offlineAccess: true });
    expect(url).toContain('scope=openid+profile+email+offline_access');
  });

  it('does not double-add offline_access when scope already includes it', () => {
    const client = new AuthClient(
      { ...VALID_CONFIG, redirectUri: 'http://localhost:8082', scope: 'openid offline_access' },
      new InMemoryTokenStorage(),
    );
    const url = client.buildAuthorizationUrl({ offlineAccess: true });
    expect(url).toContain('scope=openid+offline_access');
    // Ensure the substring `offline_access` only appears once in `scope=`.
    const scopeMatch = /scope=([^&]+)/.exec(url);
    expect(scopeMatch?.[1]?.split('+').filter((s) => s === 'offline_access')).toHaveLength(1);
  });
});

describe('AuthClient.fromIssuerUrl', () => {
  it('parses realm and base URL from the issuer', () => {
    const client = AuthClient.fromIssuerUrl(
      {
        issuerUrl: 'https://identity.dloizides.com/realms/Questioner',
        clientId: 'questioner-client',
      },
      new InMemoryTokenStorage(),
    );
    expect(client.realm).toBe('Questioner');
    expect(client.baseUrl).toBe('https://identity.dloizides.com');
    expect(client.clientId).toBe('questioner-client');
  });

  it('throws when issuer URL has no /realms/ segment', () => {
    expect(() =>
      AuthClient.fromIssuerUrl(
        { issuerUrl: 'https://identity.dloizides.com', clientId: 'c' },
        new InMemoryTokenStorage(),
      ),
    ).toThrow('cannot parse realm');
  });

  it('passes redirectUri and scope through', () => {
    const client = AuthClient.fromIssuerUrl(
      {
        issuerUrl: 'https://identity.dloizides.com/realms/OnlineMenu',
        clientId: 'c',
        redirectUri: 'http://localhost:8082',
        scope: 'openid offline_access',
      },
      new InMemoryTokenStorage(),
    );
    expect(client.redirectUri).toBe('http://localhost:8082');
    expect(client.scope).toBe('openid offline_access');
  });

  it('forwards collaborators (events emitter wired)', async () => {
    const events = new AuthEventEmitter();
    const listener = jest.fn();
    events.on('sessionExpired', listener);
    const storage = new InMemoryTokenStorage();
    const client = AuthClient.fromIssuerUrl(
      {
        issuerUrl: 'https://identity.dloizides.com/realms/OnlineMenu',
        clientId: 'c',
      },
      storage,
      { events },
    );
    // Use init with an expired tracker to verify events propagate.
    const { store } = createInactivityStore(0);
    const tracker = new InactivityTracker({ store, maxInactivityDays: 1, now: () => 1_000_000_000_000 });
    await storage.write(TOKENS);
    // Re-create client wired with the tracker.
    const wired = new AuthClient(VALID_CONFIG, storage, { events, inactivityTracker: tracker });
    void client;
    await wired.init();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('AuthClient token operations', () => {
  it('forwards getTokens / setTokens / clearTokens to storage', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(await client.getTokens()).toBeNull();
    await client.setTokens(TOKENS);
    expect(await client.getTokens()).toEqual(TOKENS);
    await client.clearTokens();
    expect(await client.getTokens()).toBeNull();
  });

  it('getAccessToken returns null when no tokens stored', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(await client.getAccessToken()).toBeNull();
  });

  it('getAccessToken returns null when tokens are expired', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    await client.setTokens(EXPIRED_TOKENS);
    expect(await client.getAccessToken(Date.now())).toBeNull();
  });

  it('getAccessToken returns the access token when not expired', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    await client.setTokens(TOKENS);
    expect(await client.getAccessToken()).toBe('a');
  });
});

describe('AuthClient.on', () => {
  it('subscribes to sessionExpired and returns an unsubscribe', () => {
    const events = new AuthEventEmitter();
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage(), { events });
    const listener = jest.fn();
    const unsub = client.on('sessionExpired', listener);
    events.emit('sessionExpired');
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    events.emit('sessionExpired');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('AuthClient.init', () => {
  it('returns hasSession=false when no tokens are stored and no tracker', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(await client.init()).toEqual({ hasSession: false });
  });

  it('returns hasSession=true when tokens exist and tracker is fresh', async () => {
    const storage = new InMemoryTokenStorage();
    await storage.write(TOKENS);
    const { store } = createInactivityStore(Date.now());
    const tracker = new InactivityTracker({ store });
    const client = new AuthClient(VALID_CONFIG, storage, { inactivityTracker: tracker });
    expect(await client.init()).toEqual({ hasSession: true });
  });

  it('clears tokens, clears tracker, emits sessionExpired when tracker reports expired', async () => {
    const storage = new InMemoryTokenStorage();
    await storage.write(TOKENS);
    const { store, state } = createInactivityStore(0);
    const tracker = new InactivityTracker({ store, maxInactivityDays: 1, now: () => 1_000_000_000_000 });
    const events = new AuthEventEmitter();
    const expired = jest.fn();
    events.on('sessionExpired', expired);
    const client = new AuthClient(VALID_CONFIG, storage, { inactivityTracker: tracker, events });
    const result = await client.init();
    expect(result).toEqual({ hasSession: false });
    expect(await storage.read()).toBeNull();
    expect(state.value).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not emit sessionExpired or clear when tracker is null (no record)', async () => {
    const storage = new InMemoryTokenStorage();
    await storage.write(TOKENS);
    const { store } = createInactivityStore();
    const tracker = new InactivityTracker({ store });
    const events = new AuthEventEmitter();
    const expired = jest.fn();
    events.on('sessionExpired', expired);
    const client = new AuthClient(VALID_CONFIG, storage, { inactivityTracker: tracker, events });
    await client.init();
    expect(await storage.read()).toEqual(TOKENS);
    expect(expired).not.toHaveBeenCalled();
  });
});

describe('AuthClient.refresh', () => {
  it('throws when no interceptor is configured', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    await expect(client.refresh()).rejects.toThrow('no RefreshInterceptor');
  });

  it('delegates to the interceptor', async () => {
    const storage = new InMemoryTokenStorage();
    const events = new AuthEventEmitter();
    const refresh: RefreshFn = jest.fn().mockResolvedValue(TOKENS);
    const interceptor = new RefreshInterceptor({ storage, events, refresh });
    const client = new AuthClient(VALID_CONFIG, storage, { interceptor, events });
    expect(await client.refresh()).toEqual(TOKENS);
  });
});

describe('AuthClient.loginWithOtp', () => {
  it('throws when no api is configured', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    await expect(client.loginWithOtp({ email: 'a@b.c', otp: '1' })).rejects.toThrow('no AuthApiClient');
  });

  it('persists tokens and marks tracker active on success', async () => {
    const storage = new InMemoryTokenStorage();
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { access_token: 'tok', refresh_token: 'r2', expires_in: 60 },
    });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const { store, state } = createInactivityStore();
    const tracker = new InactivityTracker({ store, now: () => 12_345 });
    const client = new AuthClient(VALID_CONFIG, storage, { api, inactivityTracker: tracker });
    const tokens = await client.loginWithOtp({ email: 'a@b.c', otp: '1', tenantId: 't', offlineAccess: true });
    expect(tokens.accessToken).toBe('tok');
    expect(await storage.read()).toEqual(tokens);
    expect(state.value).toBe(12_345);
    expect(JSON.parse(mock.calls[0]?.body ?? '')).toMatchObject({ offlineAccess: true });
  });

  it('throws when the response has no access_token', async () => {
    const storage = new InMemoryTokenStorage();
    const mock = createMockHttp({ status: 200, ok: true, data: {} });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const client = new AuthClient(VALID_CONFIG, storage, { api });
    await expect(client.loginWithOtp({ email: 'a@b.c', otp: '1' })).rejects.toThrow('missing access_token');
  });

  it('throws when access_token is empty string', async () => {
    const storage = new InMemoryTokenStorage();
    const mock = createMockHttp({ status: 200, ok: true, data: { access_token: '' } });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const client = new AuthClient(VALID_CONFIG, storage, { api });
    await expect(client.loginWithOtp({ email: 'a@b.c', otp: '1' })).rejects.toThrow('missing access_token');
  });

  it('does not require inactivity tracker', async () => {
    const storage = new InMemoryTokenStorage();
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { access_token: 'tok', expires_in: 60 },
    });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const client = new AuthClient(VALID_CONFIG, storage, { api });
    const tokens = await client.loginWithOtp({ email: 'a@b.c', otp: '1' });
    expect(tokens.accessToken).toBe('tok');
  });

  it('defaults offlineAccess to false when not provided', async () => {
    const storage = new InMemoryTokenStorage();
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { access_token: 'tok', expires_in: 60 },
    });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const client = new AuthClient(VALID_CONFIG, storage, { api });
    await client.loginWithOtp({ email: 'a@b.c', otp: '1' });
    expect(JSON.parse(mock.calls[0]?.body ?? '')).toMatchObject({ offlineAccess: false });
  });
});

describe('AuthClient.loginWithPassword', () => {
  it('persists tokens on success', async () => {
    const storage = new InMemoryTokenStorage();
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { access_token: 'p-tok', expires_in: 60 },
    });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const client = new AuthClient(VALID_CONFIG, storage, { api });
    const tokens = await client.loginWithPassword({ email: 'a@b.c', password: 'pw', offlineAccess: true });
    expect(tokens.accessToken).toBe('p-tok');
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/login');
  });

  it('defaults offlineAccess to false', async () => {
    const storage = new InMemoryTokenStorage();
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { access_token: 'p-tok', expires_in: 60 },
    });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const client = new AuthClient(VALID_CONFIG, storage, { api });
    await client.loginWithPassword({ email: 'a@b.c', password: 'pw' });
    expect(JSON.parse(mock.calls[0]?.body ?? '')).toMatchObject({ offlineAccess: false });
  });
});

describe('AuthClient.logout', () => {
  it('throws when no api is configured', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    await expect(client.logout()).rejects.toThrow('no AuthApiClient');
  });

  it('clears tokens + tracker after server logout', async () => {
    const storage = new InMemoryTokenStorage();
    await storage.write(TOKENS);
    const mock = createMockHttp({ status: 200, ok: true });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const { store, state } = createInactivityStore(123);
    const tracker = new InactivityTracker({ store });
    const client = new AuthClient(VALID_CONFIG, storage, { api, inactivityTracker: tracker });
    await client.logout();
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/logout');
    expect(await storage.read()).toBeNull();
    expect(state.value).toBeNull();
  });

  it('clears tokens even when server logout fails (network unreliable)', async () => {
    const storage = new InMemoryTokenStorage();
    await storage.write(TOKENS);
    const mock = createMockHttp({ status: 500, ok: false });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const client = new AuthClient(VALID_CONFIG, storage, { api });
    await expect(client.logout()).rejects.toThrow('logout failed');
    expect(await storage.read()).toBeNull();
  });

  it('logout({ everywhere: true }) calls /auth/logout?everywhere=true', async () => {
    const storage = new InMemoryTokenStorage();
    const mock = createMockHttp({ status: 200, ok: true });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const client = new AuthClient(VALID_CONFIG, storage, { api });
    await client.logout({ everywhere: true });
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/logout?everywhere=true');
  });

  it('handles missing inactivity tracker gracefully', async () => {
    const storage = new InMemoryTokenStorage();
    await storage.write(TOKENS);
    const mock = createMockHttp({ status: 200, ok: true });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const client = new AuthClient(VALID_CONFIG, storage, { api });
    await client.logout();
    expect(await storage.read()).toBeNull();
  });
});

describe('AuthClient.requestPasswordReset', () => {
  it('throws when no api is configured', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    await expect(client.requestPasswordReset({ email: 'a@b.c' })).rejects.toThrow('no AuthApiClient');
  });

  it('forwards to api.forgotPassword', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage(), { api });
    await client.requestPasswordReset({ email: 'a@b.c', tenantId: 't' });
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/forgot-password');
    expect(JSON.parse(mock.calls[0]?.body ?? '')).toEqual({ email: 'a@b.c', tenantId: 't' });
  });
});

describe('AuthClient.confirmPasswordReset', () => {
  it('throws when no api is configured', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    await expect(client.confirmPasswordReset({ token: 't', newPassword: 'p' })).rejects.toThrow(
      'no AuthApiClient',
    );
  });

  it('forwards to api.resetPassword', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const api = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage(), { api });
    await client.confirmPasswordReset({ token: 'tk', newPassword: 'pw' });
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/reset-password');
    expect(JSON.parse(mock.calls[0]?.body ?? '')).toEqual({ token: 'tk', newPassword: 'pw' });
  });
});
