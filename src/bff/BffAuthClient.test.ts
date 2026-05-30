import { BffAuthClient } from './BffAuthClient';

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

const USER_RESPONSE: HttpResponse = {
  status: 200,
  ok: true,
  data: { user: { sub: 'u1', email: 'a@b.c', roles: ['admin'] } },
};

describe('BffAuthClient.login', () => {
  it('POSTs credentials to /bff/login same-origin with cookie + CSRF header', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    const user = await client.login({ username: 'jim', password: 'secret' });

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/login');
    expect(call?.method).toBe('POST');
    expect(call?.credentials).toBe('include');
    expect(call?.headers?.['X-BFF-Csrf']).toBe('1');
    expect(JSON.parse(call?.body ?? '')).toEqual({ username: 'jim', password: 'secret' });
    expect(user.sub).toBe('u1');
  });

  it('throws when the BFF rejects the login', async () => {
    const mock = createMockHttp({ status: 401, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    await expect(client.login({ username: 'jim', password: 'bad' })).rejects.toThrow(
      'login failed with status 401',
    );
  });

  it('throws when the response is missing the user envelope', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: {} });
    const client = new BffAuthClient({ http: mock.http });

    await expect(client.login({ username: 'jim', password: 'x' })).rejects.toThrow(
      'login: BFF response missing user',
    );
  });

  it('never sends an Authorization header (no token handling)', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    await client.login({ username: 'jim', password: 'x' });

    const headerKeys = Object.keys(mock.calls[0]?.headers ?? {}).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('authorization');
  });
});

describe('BffAuthClient.logout', () => {
  it('POSTs to /bff/logout with cookie + CSRF, no body', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new BffAuthClient({ http: mock.http });

    await client.logout();

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/logout');
    expect(call?.method).toBe('POST');
    expect(call?.credentials).toBe('include');
    expect(call?.headers?.['X-BFF-Csrf']).toBe('1');
    expect(call?.body).toBeUndefined();
  });

  it('throws when the BFF returns a non-2xx status', async () => {
    const mock = createMockHttp({ status: 500, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    await expect(client.logout()).rejects.toThrow('logout failed with status 500');
  });
});

describe('BffAuthClient.getCurrentUser', () => {
  it('GETs /bff/me with the cookie and returns the user', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    const user = await client.getCurrentUser();

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/me');
    expect(call?.method).toBe('GET');
    expect(call?.credentials).toBe('include');
    expect(user?.sub).toBe('u1');
  });

  it('does NOT send the CSRF header on the GET', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    await client.getCurrentUser();

    expect(mock.calls[0]?.headers?.['X-BFF-Csrf']).toBeUndefined();
  });

  it('returns null when there is no session (401)', async () => {
    const mock = createMockHttp({ status: 401, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.getCurrentUser()).toBeNull();
  });

  it('returns null when a 200 response is missing the user envelope', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: {} });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.getCurrentUser()).toBeNull();
  });
});

describe('BffAuthClient.register', () => {
  it('POSTs the registration payload to /bff/register and returns the user', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    const user = await client.register({
      firstName: 'J',
      lastName: 'D',
      username: 'jim',
      email: 'a@b.c',
      password: 'Secret1!',
      tenantName: 'Acme',
    });

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/register');
    expect(call?.headers?.['X-BFF-Csrf']).toBe('1');
    expect(JSON.parse(call?.body ?? '').username).toBe('jim');
    expect(user.sub).toBe('u1');
  });

  it('throws when registration fails', async () => {
    const mock = createMockHttp({ status: 409, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    await expect(
      client.register({
        firstName: 'J',
        lastName: 'D',
        username: 'jim',
        email: 'a@b.c',
        password: 'x',
        tenantName: 'Acme',
      }),
    ).rejects.toThrow('register failed with status 409');
  });
});

describe('BffAuthClient.forgotPassword', () => {
  it('POSTs to /bff/forgot-password including resetUrlTemplate', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new BffAuthClient({ http: mock.http });

    await client.forgotPassword({ email: 'a@b.c', resetUrlTemplate: 'https://x/r?token={token}' });

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/forgot-password');
    expect(JSON.parse(call?.body ?? '')).toEqual({
      email: 'a@b.c',
      resetUrlTemplate: 'https://x/r?token={token}',
    });
  });

  it('throws on a non-2xx response', async () => {
    const mock = createMockHttp({ status: 503, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    await expect(client.forgotPassword({ email: 'a@b.c' })).rejects.toThrow(
      'forgot-password failed with status 503',
    );
  });
});

describe('BffAuthClient.resetPassword', () => {
  it('POSTs to /bff/reset-password with token and new password', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new BffAuthClient({ http: mock.http });

    await client.resetPassword({ token: 'tok', newPassword: 'NewPass1!' });

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/reset-password');
    expect(JSON.parse(call?.body ?? '')).toEqual({ token: 'tok', newPassword: 'NewPass1!' });
  });

  it('throws with the status code on an invalid token (400)', async () => {
    const mock = createMockHttp({ status: 400, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    await expect(client.resetPassword({ token: 'bad', newPassword: 'x' })).rejects.toThrow(
      'reset-password failed with status 400',
    );
  });
});

describe('BffAuthClient.requestOtp', () => {
  const OTP_REQUEST_RESPONSE: HttpResponse = {
    status: 200,
    ok: true,
    data: { success: true, expiresIn: 300, code: null },
  };

  it('POSTs the identifier to /bff/otp/request same-origin with cookie + CSRF', async () => {
    const mock = createMockHttp(OTP_REQUEST_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    await client.requestOtp({ identifier: 'jim@example.com' });

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/otp/request');
    expect(call?.method).toBe('POST');
    expect(call?.credentials).toBe('include');
    expect(call?.headers?.['X-BFF-Csrf']).toBe('1');
    expect(JSON.parse(call?.body ?? '')).toEqual({ identifier: 'jim@example.com' });
  });

  it('returns the relayed { success, expiresIn, code } body', async () => {
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { success: true, expiresIn: 120, code: '482913' },
    });
    const client = new BffAuthClient({ http: mock.http });

    const result = await client.requestOtp({ identifier: 'jim@example.com' });

    expect(result).toEqual({ success: true, expiresIn: 120, code: '482913' });
  });

  it('degrades gracefully when the 200 body is missing or malformed', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: {} });
    const client = new BffAuthClient({ http: mock.http });

    const result = await client.requestOtp({ identifier: 'jim@example.com' });

    expect(result).toEqual({ success: true, expiresIn: 0, code: null });
  });

  it('throws when OTP login is not enabled (501)', async () => {
    const mock = createMockHttp({ status: 501, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    await expect(client.requestOtp({ identifier: 'jim@example.com' })).rejects.toThrow(
      'otp-request failed with status 501',
    );
  });

  it('throws when the upstream service is unavailable (502)', async () => {
    const mock = createMockHttp({ status: 502, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    await expect(client.requestOtp({ identifier: 'jim@example.com' })).rejects.toThrow(
      'otp-request failed with status 502',
    );
  });
});

describe('BffAuthClient.verifyOtp', () => {
  it('POSTs username + otp to /bff/otp/verify and returns the user', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    const user = await client.verifyOtp({ username: 'jim@example.com', otp: '482913' });

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/otp/verify');
    expect(call?.method).toBe('POST');
    expect(call?.credentials).toBe('include');
    expect(call?.headers?.['X-BFF-Csrf']).toBe('1');
    expect(JSON.parse(call?.body ?? '')).toEqual({
      username: 'jim@example.com',
      otp: '482913',
    });
    expect(user.sub).toBe('u1');
  });

  it('throws on a bad or expired code (401)', async () => {
    const mock = createMockHttp({ status: 401, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    await expect(
      client.verifyOtp({ username: 'jim@example.com', otp: 'wrong' }),
    ).rejects.toThrow('otp-verify failed with status 401');
  });

  it('throws when the response is missing the user envelope', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: {} });
    const client = new BffAuthClient({ http: mock.http });

    await expect(
      client.verifyOtp({ username: 'jim@example.com', otp: '482913' }),
    ).rejects.toThrow('otp-verify: BFF response missing user');
  });

  it('never sends an Authorization header (no token handling)', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    await client.verifyOtp({ username: 'jim@example.com', otp: '482913' });

    const headerKeys = Object.keys(mock.calls[0]?.headers ?? {}).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('authorization');
  });
});

describe('BffAuthClient.pinLogin', () => {
  it('POSTs pin + eventExternalId to /bff/pin/login and returns the user', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    const user = await client.pinLogin({ pin: '4821', eventExternalId: 'evt-1' });

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/pin/login');
    expect(call?.method).toBe('POST');
    expect(call?.credentials).toBe('include');
    expect(call?.headers?.['X-BFF-Csrf']).toBe('1');
    expect(JSON.parse(call?.body ?? '')).toEqual({
      pin: '4821',
      eventExternalId: 'evt-1',
    });
    expect(user.sub).toBe('u1');
  });

  it('throws on a bad / expired / locked-out PIN (401)', async () => {
    const mock = createMockHttp({ status: 401, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    await expect(
      client.pinLogin({ pin: 'wrong', eventExternalId: 'evt-1' }),
    ).rejects.toThrow('pin-login failed with status 401');
  });

  it('throws when PIN login is not enabled for this BFF (501)', async () => {
    const mock = createMockHttp({ status: 501, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    await expect(
      client.pinLogin({ pin: '4821', eventExternalId: 'evt-1' }),
    ).rejects.toThrow('pin-login failed with status 501');
  });

  it('throws when the response is missing the user envelope', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: {} });
    const client = new BffAuthClient({ http: mock.http });

    await expect(
      client.pinLogin({ pin: '4821', eventExternalId: 'evt-1' }),
    ).rejects.toThrow('pin-login: BFF response missing user');
  });

  it('never sends an Authorization header (no token handling)', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    await client.pinLogin({ pin: '4821', eventExternalId: 'evt-1' });

    const headerKeys = Object.keys(mock.calls[0]?.headers ?? {}).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('authorization');
  });
});

describe('BffAuthClient baseUrl', () => {
  it('defaults to same-origin (empty base) — URLs are root-relative', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    await client.getCurrentUser();

    expect(mock.calls[0]?.url).toBe('/bff/me');
  });

  it('strips a trailing slash from an explicit baseUrl', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http, baseUrl: 'https://bff.test/' });

    await client.getCurrentUser();

    expect(mock.calls[0]?.url).toBe('https://bff.test/bff/me');
  });
});
