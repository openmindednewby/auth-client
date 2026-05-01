import { computeExpiresAt, isTokenExpired } from './isTokenExpired';

const NOW = 1_000_000;
const ONE_MINUTE_MS = 60_000;

describe('isTokenExpired', () => {
  it('returns true when tokens are null', () => {
    expect(isTokenExpired(null, 0, NOW)).toBe(true);
  });

  it('returns true when tokens are undefined', () => {
    expect(isTokenExpired(undefined, 0, NOW)).toBe(true);
  });

  it('returns true when expiresAt is missing (zero)', () => {
    expect(isTokenExpired({ expiresAt: 0 }, 0, NOW)).toBe(true);
  });

  it('returns true when expiresAt is negative', () => {
    expect(isTokenExpired({ expiresAt: -1 }, 0, NOW)).toBe(true);
  });

  it('returns true when expiresAt is in the past', () => {
    expect(isTokenExpired({ expiresAt: NOW - 1 }, 0, NOW)).toBe(true);
  });

  it('returns true when expiresAt equals now', () => {
    expect(isTokenExpired({ expiresAt: NOW }, 0, NOW)).toBe(true);
  });

  it('returns false when expiresAt is comfortably in the future', () => {
    expect(isTokenExpired({ expiresAt: NOW + ONE_MINUTE_MS }, 0, NOW)).toBe(false);
  });

  it('respects leewayMs to short-circuit imminent expiries', () => {
    const fiveSecondLeeway = 5_000;
    expect(isTokenExpired({ expiresAt: NOW + 1_000 }, fiveSecondLeeway, NOW)).toBe(true);
    expect(isTokenExpired({ expiresAt: NOW + 10_000 }, fiveSecondLeeway, NOW)).toBe(false);
  });

  it('uses 30-second leeway by default', () => {
    expect(isTokenExpired({ expiresAt: NOW + 10_000 }, undefined, NOW)).toBe(true);
    expect(isTokenExpired({ expiresAt: NOW + 60_000 }, undefined, NOW)).toBe(false);
  });

  it('defaults `now` to Date.now() when omitted', () => {
    const realNow = Date.now();
    expect(isTokenExpired({ expiresAt: realNow + 10 * 60_000 })).toBe(false);
    expect(isTokenExpired({ expiresAt: realNow - 10 * 60_000 })).toBe(true);
  });
});

describe('computeExpiresAt', () => {
  it('adds seconds-since-now to produce an absolute millisecond timestamp', () => {
    expect(computeExpiresAt(60, NOW)).toBe(NOW + 60_000);
  });

  it('returns 0 for undefined input', () => {
    expect(computeExpiresAt(undefined, NOW)).toBe(0);
  });

  it('returns 0 for zero input', () => {
    expect(computeExpiresAt(0, NOW)).toBe(0);
  });

  it('returns 0 for negative input', () => {
    expect(computeExpiresAt(-30, NOW)).toBe(0);
  });

  it('defaults `now` to Date.now() when omitted', () => {
    const before = Date.now();
    const result = computeExpiresAt(60);
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before + 60_000);
    expect(result).toBeLessThanOrEqual(after + 60_000);
  });
});
