/** Unit tests for the typed BFF request error (4.5.0). */
import { BffRequestError, isBffRequestError, readBffErrorCode } from './BffRequestError';

const CONFLICT = 409;

describe('readBffErrorCode', () => {
  it('reads a camelCase errorCode', () => {
    expect(readBffErrorCode({ errorCode: 'USER_EXISTS' })).toBe('USER_EXISTS');
  });

  it('reads a PascalCase ErrorCode', () => {
    expect(readBffErrorCode({ ErrorCode: 'TENANT_NAME_TAKEN' })).toBe('TENANT_NAME_TAKEN');
  });

  it.each([null, undefined, 'text', 42, {}, { errorCode: '' }, { errorCode: 7 }])(
    'returns null for %p',
    (body) => {
      expect(readBffErrorCode(body)).toBeNull();
    },
  );
});

describe('BffRequestError', () => {
  it('keeps the legacy message and carries status + errorCode', () => {
    const error = new BffRequestError('register failed with status 409', CONFLICT, 'USER_EXISTS');
    expect(error.message).toBe('register failed with status 409');
    expect(error.status).toBe(CONFLICT);
    expect(error.errorCode).toBe('USER_EXISTS');
    expect(error).toBeInstanceOf(Error);
  });

  it('is recognised by the guard, also as a structural copy', () => {
    const copy = Object.assign(new Error('x'), { name: 'BffRequestError', status: CONFLICT, errorCode: null });
    expect(isBffRequestError(new BffRequestError('x', null, null))).toBe(true);
    expect(isBffRequestError(copy)).toBe(true);
    expect(isBffRequestError(new Error('register failed with status 409'))).toBe(false);
  });
});
