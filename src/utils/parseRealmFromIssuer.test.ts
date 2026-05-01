import { parseBaseUrlFromIssuer, parseRealmFromIssuer } from './parseRealmFromIssuer';

describe('parseRealmFromIssuer', () => {
  it('extracts realm from a standard Keycloak issuer URL', () => {
    expect(parseRealmFromIssuer('https://identity.dloizides.com/realms/OnlineMenu')).toBe(
      'OnlineMenu',
    );
  });

  it('extracts realm when the issuer URL has a trailing slash', () => {
    expect(parseRealmFromIssuer('https://identity.dloizides.com/realms/OnlineMenu/')).toBe(
      'OnlineMenu',
    );
  });

  it('extracts realm when the issuer URL has a query string', () => {
    expect(
      parseRealmFromIssuer('https://identity.dloizides.com/realms/OnlineMenu?param=value'),
    ).toBe('OnlineMenu');
  });

  it('extracts realm when the issuer URL has a fragment', () => {
    expect(parseRealmFromIssuer('https://identity.dloizides.com/realms/OnlineMenu#anchor')).toBe(
      'OnlineMenu',
    );
  });

  it('extracts realm from a token-endpoint-shaped URL', () => {
    expect(
      parseRealmFromIssuer(
        'https://identity.dloizides.com/realms/Questioner/protocol/openid-connect/token',
      ),
    ).toBe('Questioner');
  });

  it('decodes URL-encoded realm names', () => {
    expect(parseRealmFromIssuer('https://k.example/realms/My%20Realm')).toBe('My Realm');
  });

  it('returns null when no /realms/ segment is present', () => {
    expect(parseRealmFromIssuer('https://identity.dloizides.com')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseRealmFromIssuer('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseRealmFromIssuer(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseRealmFromIssuer(undefined)).toBeNull();
  });

  it('returns null for non-string input via type-narrowing guard', () => {
    expect(parseRealmFromIssuer(undefined)).toBeNull();
  });

  it('returns null when the realm segment is empty', () => {
    expect(parseRealmFromIssuer('https://identity.dloizides.com/realms/')).toBeNull();
  });
});

describe('parseBaseUrlFromIssuer', () => {
  it('strips /realms/{realm} from a standard issuer URL', () => {
    expect(parseBaseUrlFromIssuer('https://identity.dloizides.com/realms/OnlineMenu')).toBe(
      'https://identity.dloizides.com',
    );
  });

  it('strips /realms/{realm}/... from a deeper URL', () => {
    expect(
      parseBaseUrlFromIssuer(
        'https://identity.dloizides.com/realms/OnlineMenu/protocol/openid-connect/token',
      ),
    ).toBe('https://identity.dloizides.com');
  });

  it('removes a trailing slash from the result', () => {
    expect(parseBaseUrlFromIssuer('https://identity.dloizides.com/')).toBe(
      'https://identity.dloizides.com',
    );
  });

  it('returns the input unchanged when no realm segment is present', () => {
    expect(parseBaseUrlFromIssuer('https://identity.dloizides.com')).toBe(
      'https://identity.dloizides.com',
    );
  });

  it('returns null for empty input', () => {
    expect(parseBaseUrlFromIssuer('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseBaseUrlFromIssuer(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseBaseUrlFromIssuer(undefined)).toBeNull();
  });
});
