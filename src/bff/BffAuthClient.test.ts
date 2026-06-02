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

  it('throws when the 200 response is missing the user envelope', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: {} });
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
    ).rejects.toThrow('register: BFF response missing user');
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

  it('degrades gracefully when the 200 body is not a record at all', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: 'unexpected' });
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

describe('BffAuthClient.getLoginConfig', () => {
  it('GETs /bff/config same-origin with the cookie and no CSRF header', async () => {
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { methods: ['password', 'otp'], registrationEnabled: true },
    });
    const client = new BffAuthClient({ http: mock.http });

    await client.getLoginConfig();

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/config');
    expect(call?.method).toBe('GET');
    expect(call?.credentials).toBe('include');
    expect(call?.headers?.['X-BFF-Csrf']).toBeUndefined();
  });

  it('parses methods (lowercased + de-duplicated), registration, and device-state', async () => {
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: {
        methods: ['Password', 'OTP', 'password', 'pin', 'passkey'],
        registrationEnabled: true,
        rememberedUsername: 'jim',
        hasPin: true,
        pinDigits: 6,
        preferredMethod: 'pin',
      },
    });
    const client = new BffAuthClient({ http: mock.http });

    const config = await client.getLoginConfig();

    expect(config).toEqual({
      methods: ['password', 'otp', 'pin', 'passkey'],
      registrationEnabled: true,
      deviceState: {
        rememberedUsername: 'jim',
        hasPin: true,
        pinDigits: 6,
        preferredMethod: 'pin',
      },
    });
  });

  it('drops non-string / empty method entries and falls back when none remain', async () => {
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { methods: [1, '', null, true] },
    });
    const client = new BffAuthClient({ http: mock.http });

    const config = await client.getLoginConfig();

    expect(config.methods).toEqual(['password']);
  });

  it('falls back to ["password"] when methods is not an array', async () => {
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { methods: 'password', registrationEnabled: true },
    });
    const client = new BffAuthClient({ http: mock.http });

    const config = await client.getLoginConfig();

    expect(config.methods).toEqual(['password']);
    expect(config.registrationEnabled).toBe(true);
  });

  it('safe-defaults device-state fields (bad pinDigits, missing strings, hasPin not true)', async () => {
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: {
        methods: ['password'],
        hasPin: 'yes',
        pinDigits: 5,
        rememberedUsername: '',
        preferredMethod: 42,
      },
    });
    const client = new BffAuthClient({ http: mock.http });

    const config = await client.getLoginConfig();

    expect(config.deviceState).toEqual({
      rememberedUsername: null,
      hasPin: false,
      pinDigits: null,
      preferredMethod: null,
    });
    expect(config.registrationEnabled).toBe(false);
  });

  it('returns the safe fallback when the body is not a record', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: 'nope' });
    const client = new BffAuthClient({ http: mock.http });

    const config = await client.getLoginConfig();

    expect(config).toEqual({
      methods: ['password'],
      registrationEnabled: false,
      deviceState: {
        rememberedUsername: null,
        hasPin: false,
        pinDigits: null,
        preferredMethod: null,
      },
    });
  });

  it('returns the safe fallback on a non-2xx response', async () => {
    const mock = createMockHttp({ status: 500, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    const config = await client.getLoginConfig();

    expect(config.methods).toEqual(['password']);
    expect(config.deviceState.hasPin).toBe(false);
  });

  it('returns the safe fallback when the transport throws (network error)', async () => {
    const http: HttpClient = () => Promise.reject(new Error('network down'));
    const client = new BffAuthClient({ http });

    const config = await client.getLoginConfig();

    expect(config.methods).toEqual(['password']);
  });
});

describe('BffAuthClient.enrollDevicePin', () => {
  it('POSTs pin + digits to /bff/pin/enroll with cookie + CSRF and returns success', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new BffAuthClient({ http: mock.http });

    const result = await client.enrollDevicePin({ pin: '4821', digits: 4 });

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/pin/enroll');
    expect(call?.method).toBe('POST');
    expect(call?.credentials).toBe('include');
    expect(call?.headers?.['X-BFF-Csrf']).toBe('1');
    expect(JSON.parse(call?.body ?? '')).toEqual({ pin: '4821', digits: 4 });
    expect(result).toEqual({ status: 'success' });
  });

  it('maps 401 → unauthorized', async () => {
    const mock = createMockHttp({ status: 401, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.enrollDevicePin({ pin: '4821', digits: 4 })).toEqual({
      status: 'unauthorized',
    });
  });

  it('maps 403 → forbidden', async () => {
    const mock = createMockHttp({ status: 403, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.enrollDevicePin({ pin: '4821', digits: 4 })).toEqual({
      status: 'forbidden',
    });
  });

  it('maps 400 → invalidPin', async () => {
    const mock = createMockHttp({ status: 400, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.enrollDevicePin({ pin: 'x', digits: 4 })).toEqual({
      status: 'invalidPin',
    });
  });

  it('maps other non-2xx (e.g. 501) → error', async () => {
    const mock = createMockHttp({ status: 501, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.enrollDevicePin({ pin: '4821', digits: 4 })).toEqual({
      status: 'error',
    });
  });

  it('maps a transport throw → error (never rejects)', async () => {
    const http: HttpClient = () => Promise.reject(new Error('boom'));
    const client = new BffAuthClient({ http });

    expect(await client.enrollDevicePin({ pin: '4821', digits: 4 })).toEqual({
      status: 'error',
    });
  });
});

describe('BffAuthClient.unlockWithDevicePin', () => {
  it('POSTs pin to /bff/pin/unlock with cookie + CSRF and returns the user on 200', async () => {
    const mock = createMockHttp(USER_RESPONSE);
    const client = new BffAuthClient({ http: mock.http });

    const result = await client.unlockWithDevicePin({ pin: '4821' });

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/pin/unlock');
    expect(call?.method).toBe('POST');
    expect(call?.credentials).toBe('include');
    expect(call?.headers?.['X-BFF-Csrf']).toBe('1');
    expect(JSON.parse(call?.body ?? '')).toEqual({ pin: '4821' });
    expect(result).toEqual({ status: 'success', user: { sub: 'u1', email: 'a@b.c', roles: ['admin'] } });
  });

  it('returns error when a 200 body is missing the user envelope', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: {} });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.unlockWithDevicePin({ pin: '4821' })).toEqual({ status: 'error' });
  });

  it('returns error when a 200 body is not a record at all', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: 'unexpected' });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.unlockWithDevicePin({ pin: '4821' })).toEqual({ status: 'error' });
  });

  it('maps 401 → invalid', async () => {
    const mock = createMockHttp({ status: 401, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.unlockWithDevicePin({ pin: 'wrong' })).toEqual({ status: 'invalid' });
  });

  it('maps a 429 with a JSON body → locked, parsing Retry-After', async () => {
    const mock = createMockHttp({
      status: 429,
      ok: false,
      data: { error: 'device_locked' },
      header: (name) => (name === 'Retry-After' ? '30' : null),
    });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.unlockWithDevicePin({ pin: '4821' })).toEqual({
      status: 'locked',
      retryAfterSeconds: 30,
    });
  });

  it('maps a 429 with an EMPTY body → rateLimited (per-IP limiter)', async () => {
    const mock = createMockHttp({
      status: 429,
      ok: false,
      header: (name) => (name === 'Retry-After' ? '12' : null),
    });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.unlockWithDevicePin({ pin: '4821' })).toEqual({
      status: 'rateLimited',
      retryAfterSeconds: 12,
    });
  });

  it('locked result has retryAfterSeconds null when Retry-After is absent', async () => {
    const mock = createMockHttp({ status: 429, ok: false, data: { error: 'x' } });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.unlockWithDevicePin({ pin: '4821' })).toEqual({
      status: 'locked',
      retryAfterSeconds: null,
    });
  });

  it('parses retryAfterSeconds as null when Retry-After is non-numeric', async () => {
    const mock = createMockHttp({
      status: 429,
      ok: false,
      header: (name) => (name === 'Retry-After' ? 'soon' : null),
    });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.unlockWithDevicePin({ pin: '4821' })).toEqual({
      status: 'rateLimited',
      retryAfterSeconds: null,
    });
  });

  it('parses retryAfterSeconds as null when Retry-After is negative', async () => {
    const mock = createMockHttp({
      status: 429,
      ok: false,
      header: (name) => (name === 'Retry-After' ? '-5' : null),
    });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.unlockWithDevicePin({ pin: '4821' })).toEqual({
      status: 'rateLimited',
      retryAfterSeconds: null,
    });
  });

  it('treats Retry-After null (header present, value absent) as null seconds', async () => {
    const mock = createMockHttp({
      status: 429,
      ok: false,
      header: () => null,
    });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.unlockWithDevicePin({ pin: '4821' })).toEqual({
      status: 'rateLimited',
      retryAfterSeconds: null,
    });
  });

  it('maps any other status (e.g. 500) → error', async () => {
    const mock = createMockHttp({ status: 500, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.unlockWithDevicePin({ pin: '4821' })).toEqual({ status: 'error' });
  });

  it('maps a transport throw → error (never rejects)', async () => {
    const http: HttpClient = () => Promise.reject(new Error('boom'));
    const client = new BffAuthClient({ http });

    expect(await client.unlockWithDevicePin({ pin: '4821' })).toEqual({ status: 'error' });
  });
});

describe('BffAuthClient.disableDevicePin', () => {
  it('POSTs to /bff/pin/disable with cookie + CSRF, no body, and returns true on 2xx', async () => {
    const mock = createMockHttp({ status: 200, ok: true });
    const client = new BffAuthClient({ http: mock.http });

    const result = await client.disableDevicePin();

    const call = mock.calls[0];
    expect(call?.url).toBe('/bff/pin/disable');
    expect(call?.method).toBe('POST');
    expect(call?.credentials).toBe('include');
    expect(call?.headers?.['X-BFF-Csrf']).toBe('1');
    expect(call?.body).toBeUndefined();
    expect(result).toBe(true);
  });

  it('returns false on a non-2xx response', async () => {
    const mock = createMockHttp({ status: 401, ok: false });
    const client = new BffAuthClient({ http: mock.http });

    expect(await client.disableDevicePin()).toBe(false);
  });

  it('returns false when the transport throws (never rejects)', async () => {
    const http: HttpClient = () => Promise.reject(new Error('boom'));
    const client = new BffAuthClient({ http });

    expect(await client.disableDevicePin()).toBe(false);
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
