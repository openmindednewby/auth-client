import { decodeJwt } from './decodeJwt';

const HEADER_BASE64 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'; // {"alg":"HS256","typ":"JWT"}
const SIGNATURE = 'sig';

function buildToken(payload: object): string {
  const json = JSON.stringify(payload);
  // Browser-style base64url encoding via Buffer (Jest runs in node).
  const encoded = Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${HEADER_BASE64}.${encoded}.${SIGNATURE}`;
}

describe('decodeJwt', () => {
  it('decodes a valid JWT payload', () => {
    const token = buildToken({ sub: 'user-1', exp: 12345 });
    expect(decodeJwt(token)).toEqual({ sub: 'user-1', exp: 12345 });
  });

  it('decodes a payload containing UTF-8 characters', () => {
    const token = buildToken({ name: 'Demétrïs ✨' });
    expect(decodeJwt<{ name: string }>(token)).toEqual({ name: 'Demétrïs ✨' });
  });

  it('returns null for empty string', () => {
    expect(decodeJwt('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(decodeJwt(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(decodeJwt(undefined)).toBeNull();
  });

  it('returns null when token does not have three segments', () => {
    expect(decodeJwt('header.payload')).toBeNull();
    expect(decodeJwt('only-one-segment')).toBeNull();
    expect(decodeJwt('a.b.c.d')).toBeNull();
  });

  it('returns null when the payload segment is empty', () => {
    expect(decodeJwt(`${HEADER_BASE64}..${SIGNATURE}`)).toBeNull();
  });

  it('returns null when the payload segment is not valid base64', () => {
    expect(decodeJwt(`${HEADER_BASE64}.!!!.${SIGNATURE}`)).toBeNull();
  });

  it('returns null when the decoded payload is not a JSON object', () => {
    const numberPayload = Buffer.from('42', 'utf8').toString('base64').replace(/=+$/, '');
    expect(decodeJwt(`${HEADER_BASE64}.${numberPayload}.${SIGNATURE}`)).toBeNull();

    const stringPayload = Buffer.from('"hello"', 'utf8').toString('base64').replace(/=+$/, '');
    expect(decodeJwt(`${HEADER_BASE64}.${stringPayload}.${SIGNATURE}`)).toBeNull();
  });

  it('returns null when globalThis.atob is unavailable', () => {
    const original = globalThis.atob;
    Object.defineProperty(globalThis, 'atob', { value: undefined, configurable: true });
    try {
      const token = buildToken({ sub: 'x' });
      expect(decodeJwt(token)).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'atob', { value: original, configurable: true });
    }
  });

  it('falls back to the binary string when TextDecoder is unavailable', () => {
    const originalDecoder = (globalThis as { TextDecoder?: unknown }).TextDecoder;
    Object.defineProperty(globalThis, 'TextDecoder', { value: undefined, configurable: true });
    try {
      const token = buildToken({ sub: 'ascii-only' });
      // ASCII payload survives the binary-string fallback unchanged.
      expect(decodeJwt<{ sub: string }>(token)).toEqual({ sub: 'ascii-only' });
    } finally {
      Object.defineProperty(globalThis, 'TextDecoder', {
        value: originalDecoder,
        configurable: true,
      });
    }
  });
});
