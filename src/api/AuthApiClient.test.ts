import { AuthApiClient } from './AuthApiClient';

import type { HttpClient, HttpRequest, HttpResponse } from '../http/HttpClient';

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

describe('AuthApiClient.loginWithOtp', () => {
  it('POSTs to /auth/verify-otp with JSON body and returns raw response', async () => {
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { access_token: 'a', refresh_token: 'r', expires_in: 60 },
    });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const result = await client.loginWithOtp({ email: 'a@b.c', otp: '1234', tenantId: 't' });
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/verify-otp');
    expect(mock.calls[0]?.method).toBe('POST');
    expect(JSON.parse(mock.calls[0]?.body ?? '')).toEqual({ email: 'a@b.c', otp: '1234', tenantId: 't' });
    expect(result.access_token).toBe('a');
  });

  it('throws when response is not ok', async () => {
    const mock = createMockHttp({ status: 401, ok: false });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await expect(client.loginWithOtp({ email: 'a@b.c', otp: '1' })).rejects.toThrow('login failed with status 401');
  });

  it('returns empty object when response data is undefined', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const result = await client.loginWithOtp({ email: 'a@b.c', otp: '1' });
    expect(result).toEqual({});
  });

  it('strips trailing slash from baseUrl', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test/' });
    await client.loginWithOtp({ email: 'a@b.c', otp: '1' });
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/verify-otp');
  });

  it('passes credentials: include when useCredentials is true', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({
      http: mock.http,
      baseUrl: 'https://api.test',
      useCredentials: true,
    });
    await client.loginWithOtp({ email: 'a@b.c', otp: '1' });
    expect(mock.calls[0]?.credentials).toBe('include');
  });
});

describe('AuthApiClient.loginWithPassword', () => {
  it('POSTs to /auth/login', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: { access_token: 'a' } });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await client.loginWithPassword({ email: 'a@b.c', password: 'pw' });
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/login');
  });
});

describe('AuthApiClient.refreshCookie', () => {
  it('POSTs to /auth/refresh-cookie with credentials', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: { access_token: 'fresh' } });
    const client = new AuthApiClient({
      http: mock.http,
      baseUrl: 'https://api.test',
      useCredentials: true,
    });
    const result = await client.refreshCookie();
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/refresh-cookie');
    expect(mock.calls[0]?.credentials).toBe('include');
    expect(result.access_token).toBe('fresh');
  });

  it('omits credentials when useCredentials is false', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: {} });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await client.refreshCookie();
    expect(mock.calls[0]?.credentials).toBeUndefined();
  });

  it('throws on non-ok response', async () => {
    const mock = createMockHttp({ status: 401, ok: false });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await expect(client.refreshCookie()).rejects.toThrow('refresh-cookie failed with status 401');
  });

  it('returns empty object when data is undefined', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const result = await client.refreshCookie();
    expect(result).toEqual({});
  });
});

describe('AuthApiClient.logout', () => {
  it('POSTs to /auth/logout by default', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await client.logout();
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/logout');
  });

  it('POSTs to /auth/logout?everywhere=true when flag set', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await client.logout(true);
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/logout?everywhere=true');
  });

  it('throws on non-ok response', async () => {
    const mock = createMockHttp({ status: 500, ok: false });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await expect(client.logout()).rejects.toThrow('logout failed with status 500');
  });

  it('attaches Bearer token when getAccessToken returns one', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({
      http: mock.http,
      baseUrl: 'https://api.test',
      getAccessToken: () => Promise.resolve('access-x'),
    });
    await client.logout();
    expect(mock.calls[0]?.headers?.authorization).toBe('Bearer access-x');
  });

  it('omits Authorization when getAccessToken returns null', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({
      http: mock.http,
      baseUrl: 'https://api.test',
      getAccessToken: () => Promise.resolve(null),
    });
    await client.logout();
    expect(mock.calls[0]?.headers?.authorization).toBeUndefined();
  });

  it('omits Authorization when getAccessToken returns empty string', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({
      http: mock.http,
      baseUrl: 'https://api.test',
      getAccessToken: () => Promise.resolve(''),
    });
    await client.logout();
    expect(mock.calls[0]?.headers?.authorization).toBeUndefined();
  });

  it('omits Authorization when no getAccessToken supplier is configured', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await client.logout();
    expect(mock.calls[0]?.headers?.authorization).toBeUndefined();
  });

  it('passes credentials: include when useCredentials is true', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({
      http: mock.http,
      baseUrl: 'https://api.test',
      useCredentials: true,
    });
    await client.logout();
    expect(mock.calls[0]?.credentials).toBe('include');
  });
});

describe('AuthApiClient.forgotPassword', () => {
  it('POSTs to /auth/forgot-password with body', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await client.forgotPassword({ email: 'a@b.c', tenantId: 't' });
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/forgot-password');
    expect(JSON.parse(mock.calls[0]?.body ?? '')).toEqual({ email: 'a@b.c', tenantId: 't' });
  });

  it('throws on non-ok response', async () => {
    const mock = createMockHttp({ status: 500, ok: false });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await expect(client.forgotPassword({ email: 'a@b.c' })).rejects.toThrow(
      'forgot-password failed with status 500',
    );
  });
});

describe('AuthApiClient.resetPassword', () => {
  it('POSTs to /auth/reset-password with body', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await client.resetPassword({ token: 'tk', newPassword: 'pw' });
    expect(mock.calls[0]?.url).toBe('https://api.test/auth/reset-password');
    expect(JSON.parse(mock.calls[0]?.body ?? '')).toEqual({ token: 'tk', newPassword: 'pw' });
  });

  it('throws on non-ok', async () => {
    const mock = createMockHttp({ status: 400, ok: false });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await expect(client.resetPassword({ token: 't', newPassword: 'p' })).rejects.toThrow(
      'reset-password failed with status 400',
    );
  });
});

describe('AuthApiClient.listSessions', () => {
  it('GETs /me/sessions and returns the array', async () => {
    const sessions = [{ id: 'a' }, { id: 'b', isCurrent: true }];
    const mock = createMockHttp({ status: 200, ok: true, data: sessions });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    const result = await client.listSessions();
    expect(mock.calls[0]?.method).toBe('GET');
    expect(mock.calls[0]?.url).toBe('https://api.test/me/sessions');
    expect(result).toEqual(sessions);
  });

  it('returns empty array when payload is not an array', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: { not: 'array' } });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    expect(await client.listSessions()).toEqual([]);
  });

  it('throws on non-ok response', async () => {
    const mock = createMockHttp({ status: 401, ok: false });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await expect(client.listSessions()).rejects.toThrow('listSessions failed with status 401');
  });

  it('passes credentials: include when useCredentials is true', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: [] });
    const client = new AuthApiClient({
      http: mock.http,
      baseUrl: 'https://api.test',
      useCredentials: true,
    });
    await client.listSessions();
    expect(mock.calls[0]?.credentials).toBe('include');
  });
});

describe('AuthApiClient.revokeSession', () => {
  it('POSTs to /me/sessions/{id}/revoke', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await client.revokeSession('abc');
    expect(mock.calls[0]?.url).toBe('https://api.test/me/sessions/abc/revoke');
    expect(mock.calls[0]?.method).toBe('POST');
  });

  it('URL-encodes the session id', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await client.revokeSession('a/b c');
    expect(mock.calls[0]?.url).toBe('https://api.test/me/sessions/a%2Fb%20c/revoke');
  });

  it('throws on non-ok response', async () => {
    const mock = createMockHttp({ status: 404, ok: false });
    const client = new AuthApiClient({ http: mock.http, baseUrl: 'https://api.test' });
    await expect(client.revokeSession('x')).rejects.toThrow('revokeSession failed with status 404');
  });

  it('passes credentials: include when useCredentials is true', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new AuthApiClient({
      http: mock.http,
      baseUrl: 'https://api.test',
      useCredentials: true,
    });
    await client.revokeSession('s');
    expect(mock.calls[0]?.credentials).toBe('include');
  });
});
