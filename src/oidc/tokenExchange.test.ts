import {
  exchangeAuthorizationCode,
  refreshAccessToken,
} from './tokenExchange';

import type { HttpClient, HttpRequest, HttpResponse } from '../http/HttpClient';

const BASE_URL = 'https://identity.dloizides.com';
const REALM = 'onlinemenu';
const CLIENT_ID = 'online-menu-client';
const TOKEN_ENDPOINT = `${BASE_URL}/realms/${REALM}/protocol/openid-connect/token`;

const RAW_TOKEN = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 300,
  token_type: 'Bearer',
};

interface MockHttp {
  http: HttpClient;
  calls: HttpRequest[];
}

function createMockHttp(response: HttpResponse): MockHttp {
  const calls: HttpRequest[] = [];
  const http: HttpClient = (request) => {
    calls.push(request);
    return Promise.resolve(response);
  };
  return { http, calls };
}

describe('exchangeAuthorizationCode', () => {
  it('POSTs to the realm token endpoint with the PKCE body', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: RAW_TOKEN });
    const tokens = await exchangeAuthorizationCode({
      http: mock.http,
      baseUrl: BASE_URL,
      realm: REALM,
      clientId: CLIENT_ID,
      code: 'auth-code-1',
      redirectUri: 'http://localhost:8082',
      codeVerifier: 'verifier-xyz',
    });
    expect(tokens.accessToken).toBe('access-1');
    expect(tokens.refreshToken).toBe('refresh-1');
    expect(mock.calls[0]?.url).toBe(TOKEN_ENDPOINT);
    expect(mock.calls[0]?.method).toBe('POST');
    expect(mock.calls[0]?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const params = new URLSearchParams(mock.calls[0]?.body ?? '');
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('client_id')).toBe(CLIENT_ID);
    expect(params.get('code')).toBe('auth-code-1');
    expect(params.get('redirect_uri')).toBe('http://localhost:8082');
    expect(params.get('code_verifier')).toBe('verifier-xyz');
  });

  it('throws when the HTTP call returns non-2xx', async () => {
    const mock = createMockHttp({ status: 400, ok: false, data: { error: 'invalid_grant' } });
    await expect(
      exchangeAuthorizationCode({
        http: mock.http,
        baseUrl: BASE_URL,
        realm: REALM,
        clientId: CLIENT_ID,
        code: 'bad',
        redirectUri: 'http://localhost:8082',
        codeVerifier: 'v',
      }),
    ).rejects.toThrow('token endpoint POST failed: 400');
  });

  it('throws when the response body is missing access_token', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: {} });
    await expect(
      exchangeAuthorizationCode({
        http: mock.http,
        baseUrl: BASE_URL,
        realm: REALM,
        clientId: CLIENT_ID,
        code: 'c',
        redirectUri: 'http://localhost:8082',
        codeVerifier: 'v',
      }),
    ).rejects.toThrow('access_token');
  });
});

describe('refreshAccessToken', () => {
  it('POSTs to the realm token endpoint with the refresh_token body', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: RAW_TOKEN });
    const tokens = await refreshAccessToken({
      http: mock.http,
      baseUrl: BASE_URL,
      realm: REALM,
      clientId: CLIENT_ID,
      refreshToken: 'old-refresh',
    });
    expect(tokens.accessToken).toBe('access-1');
    expect(mock.calls[0]?.url).toBe(TOKEN_ENDPOINT);
    const params = new URLSearchParams(mock.calls[0]?.body ?? '');
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('client_id')).toBe(CLIENT_ID);
    expect(params.get('refresh_token')).toBe('old-refresh');
  });

  it('throws when the HTTP call returns non-2xx', async () => {
    const mock = createMockHttp({ status: 401, ok: false });
    await expect(
      refreshAccessToken({
        http: mock.http,
        baseUrl: BASE_URL,
        realm: REALM,
        clientId: CLIENT_ID,
        refreshToken: 'expired',
      }),
    ).rejects.toThrow('token endpoint POST failed: 401');
  });
});
