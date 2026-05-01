import { extractAuthCode } from './extractAuthCode';

describe('extractAuthCode', () => {
  it('returns the code from a successful response', () => {
    expect(extractAuthCode({ type: 'success', params: { code: 'abc' } })).toBe('abc');
  });

  it('returns undefined when response is null', () => {
    expect(extractAuthCode(null)).toBeUndefined();
  });

  it('returns undefined when response is undefined', () => {
    expect(extractAuthCode(undefined)).toBeUndefined();
  });

  it('returns undefined when type is not success', () => {
    expect(extractAuthCode({ type: 'error', params: { code: 'abc' } })).toBeUndefined();
    expect(extractAuthCode({ type: 'cancel', params: { code: 'abc' } })).toBeUndefined();
    expect(extractAuthCode({ params: { code: 'abc' } })).toBeUndefined();
  });

  it('returns undefined when params object is missing', () => {
    expect(extractAuthCode({ type: 'success' })).toBeUndefined();
  });

  it('returns undefined when code is missing', () => {
    expect(extractAuthCode({ type: 'success', params: {} })).toBeUndefined();
  });

  it('returns undefined when code is empty string', () => {
    expect(extractAuthCode({ type: 'success', params: { code: '' } })).toBeUndefined();
  });

  it('returns undefined when code is not a string', () => {
    const malformed = { type: 'success', params: { code: 123 as unknown as string } };
    expect(extractAuthCode(malformed)).toBeUndefined();
  });
});
