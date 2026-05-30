import {
  deriveCodeChallenge,
  generateCodeVerifier,
  generatePkcePair,
} from './pkce';

const RFC_MIN = 43;
const RFC_MAX = 128;

describe('generateCodeVerifier', () => {
  it('defaults to a length inside the RFC 7636 band (43-128)', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(RFC_MIN);
    expect(verifier.length).toBeLessThanOrEqual(RFC_MAX);
  });

  it('honours the requested length', () => {
    expect(generateCodeVerifier(RFC_MIN).length).toBe(RFC_MIN);
    expect(generateCodeVerifier(RFC_MAX).length).toBe(RFC_MAX);
  });

  it('uses only unreserved characters per RFC 3986', () => {
    const verifier = generateCodeVerifier(96);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('produces distinct values across calls (random)', () => {
    const a = generateCodeVerifier(64);
    const b = generateCodeVerifier(64);
    expect(a).not.toBe(b);
  });

  it('throws when length is below the RFC minimum', () => {
    expect(() => generateCodeVerifier(RFC_MIN - 1)).toThrow('code_verifier length');
  });

  it('throws when length is above the RFC maximum', () => {
    expect(() => generateCodeVerifier(RFC_MAX + 1)).toThrow('code_verifier length');
  });
});

describe('deriveCodeChallenge', () => {
  it('produces a base64url string (no padding, URL-safe alphabet)', async () => {
    const challenge = await deriveCodeChallenge(generateCodeVerifier(64));
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(challenge.endsWith('=')).toBe(false);
  });

  it('is deterministic — same verifier yields the same challenge', async () => {
    const verifier = generateCodeVerifier(64);
    const a = await deriveCodeChallenge(verifier);
    const b = await deriveCodeChallenge(verifier);
    expect(a).toBe(b);
  });

  it('matches the known RFC 7636 Appendix B test vector', async () => {
    // RFC 7636 Appendix B:
    // verifier  = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    // challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await deriveCodeChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('throws when verifier is too short', async () => {
    await expect(deriveCodeChallenge('a'.repeat(RFC_MIN - 1))).rejects.toThrow('code_verifier length');
  });

  it('throws when verifier is too long', async () => {
    await expect(deriveCodeChallenge('a'.repeat(RFC_MAX + 1))).rejects.toThrow('code_verifier length');
  });
});

describe('generatePkcePair', () => {
  it('returns a verifier + matching S256 challenge bundle', async () => {
    const pair = await generatePkcePair();
    expect(pair.codeChallengeMethod).toBe('S256');
    expect(pair.codeVerifier.length).toBeGreaterThanOrEqual(RFC_MIN);
    const expected = await deriveCodeChallenge(pair.codeVerifier);
    expect(pair.codeChallenge).toBe(expected);
  });

  it('honours the requested verifier length', async () => {
    const pair = await generatePkcePair(RFC_MIN);
    expect(pair.codeVerifier.length).toBe(RFC_MIN);
  });
});

describe('crypto availability guard', () => {
  it('throws a clear error when crypto.subtle is unavailable', () => {
    const original = (globalThis as { crypto?: Crypto }).crypto;
    try {
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
      expect(() => generateCodeVerifier()).toThrow('crypto.subtle is required');
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});

describe('base64url fallback path (Buffer when btoa absent)', () => {
  it('falls back to Buffer when globalThis.btoa is undefined (Node before 16)', async () => {
    const original = (globalThis as { btoa?: (s: string) => string }).btoa;
    try {
      Object.defineProperty(globalThis, 'btoa', { value: undefined, configurable: true });
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = await deriveCodeChallenge(verifier);
      expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    } finally {
      if (original === undefined) {
        Object.defineProperty(globalThis, 'btoa', { value: undefined, configurable: true });
      } else {
        Object.defineProperty(globalThis, 'btoa', { value: original, configurable: true });
      }
    }
  });
});
