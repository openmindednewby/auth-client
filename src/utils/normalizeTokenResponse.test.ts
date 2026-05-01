import { normalizeTokenResponse, tokenResponseToAuthTokens } from './normalizeTokenResponse';

import type { RawTokenResponse } from '../types/TokenResponse';

describe('normalizeTokenResponse', () => {
  it('maps snake_case fields to camelCase', () => {
    const raw: RawTokenResponse = {
      access_token: 'a',
      refresh_token: 'r',
      id_token: 'i',
      expires_in: 300,
      token_type: 'Bearer',
      scope: 'openid profile',
    };
    expect(normalizeTokenResponse(raw)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      idToken: 'i',
      expiresIn: 300,
      tokenType: 'Bearer',
      scope: 'openid profile',
    });
  });

  it('omits optional fields when missing or empty', () => {
    const raw: RawTokenResponse = { access_token: 'a' };
    const result = normalizeTokenResponse(raw);
    expect(result.accessToken).toBe('a');
    expect(result.refreshToken).toBeUndefined();
    expect(result.idToken).toBeUndefined();
    expect(result.expiresIn).toBeUndefined();
  });

  it('omits empty-string optional fields', () => {
    const raw: RawTokenResponse = { access_token: 'a', refresh_token: '', id_token: '' };
    const result = normalizeTokenResponse(raw);
    expect(result.refreshToken).toBeUndefined();
    expect(result.idToken).toBeUndefined();
  });

  it('throws when access_token is missing', () => {
    const raw = {} as RawTokenResponse;
    expect(() => normalizeTokenResponse(raw)).toThrow('Token response missing access_token');
  });

  it('throws when access_token is empty string', () => {
    const raw: RawTokenResponse = { access_token: '' };
    expect(() => normalizeTokenResponse(raw)).toThrow('Token response missing access_token');
  });

  it('ignores non-finite expires_in values', () => {
    const raw: RawTokenResponse = { access_token: 'a', expires_in: Number.NaN };
    expect(normalizeTokenResponse(raw).expiresIn).toBeUndefined();
  });
});

describe('tokenResponseToAuthTokens', () => {
  const NOW = 1_000_000;

  it('computes expiresAt from expiresIn at the given clock', () => {
    const tokens = tokenResponseToAuthTokens(
      { accessToken: 'a', expiresIn: 60 },
      NOW,
    );
    expect(tokens.expiresAt).toBe(NOW + 60_000);
    expect(tokens.accessToken).toBe('a');
  });

  it('sets expiresAt to 0 when expiresIn is missing', () => {
    const tokens = tokenResponseToAuthTokens({ accessToken: 'a' }, NOW);
    expect(tokens.expiresAt).toBe(0);
  });

  it('preserves refreshToken and idToken when present', () => {
    const tokens = tokenResponseToAuthTokens(
      { accessToken: 'a', refreshToken: 'r', idToken: 'i', expiresIn: 60 },
      NOW,
    );
    expect(tokens.refreshToken).toBe('r');
    expect(tokens.idToken).toBe('i');
  });

  it('defaults `now` to Date.now() when omitted', () => {
    const before = Date.now();
    const tokens = tokenResponseToAuthTokens({ accessToken: 'a', expiresIn: 60 });
    const after = Date.now();
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(tokens.expiresAt).toBeLessThanOrEqual(after + 60_000);
  });
});
