import {
  buildAuthorizationCodeBody,
  buildRefreshTokenBody,
} from './buildTokenRequestBody';

describe('buildAuthorizationCodeBody', () => {
  it('produces a urlencoded body with all OAuth fields', () => {
    const body = buildAuthorizationCodeBody({
      clientId: 'online-menu-client',
      code: 'abc123',
      redirectUri: 'http://localhost:8082',
      codeVerifier: 'ver-1',
    });
    const params = new URLSearchParams(body);
    expect(params.get('client_id')).toBe('online-menu-client');
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('abc123');
    expect(params.get('redirect_uri')).toBe('http://localhost:8082');
    expect(params.get('code_verifier')).toBe('ver-1');
  });

  it('escapes special characters in values', () => {
    const body = buildAuthorizationCodeBody({
      clientId: 'c',
      code: 'a&b=c',
      redirectUri: 'http://localhost:8082/cb?x=1',
      codeVerifier: 'v',
    });
    expect(body).toContain('code=a%26b%3Dc');
    expect(body).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8082%2Fcb%3Fx%3D1');
  });
});

describe('buildRefreshTokenBody', () => {
  it('produces a urlencoded body for the refresh grant', () => {
    const body = buildRefreshTokenBody({
      clientId: 'c',
      refreshToken: 'rt',
    });
    const params = new URLSearchParams(body);
    expect(params.get('client_id')).toBe('c');
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe('rt');
  });
});
