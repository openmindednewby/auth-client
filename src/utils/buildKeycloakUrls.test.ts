import {
  buildAuthorizationEndpoint,
  buildAuthorizationUrl,
  buildIssuerUrl,
  buildLogoutEndpoint,
  buildTokenEndpoint,
  buildUserInfoEndpoint,
} from './buildKeycloakUrls';

const BASE = 'https://identity.dloizides.com';
const REALM = 'OnlineMenu';
const CLIENT = 'online-menu-client';
const REDIRECT = 'http://localhost:8082';

describe('buildIssuerUrl', () => {
  it('joins baseUrl + /realms/{realm}', () => {
    expect(buildIssuerUrl(BASE, REALM)).toBe(`${BASE}/realms/${REALM}`);
  });

  it('strips trailing slash from baseUrl', () => {
    expect(buildIssuerUrl(`${BASE}/`, REALM)).toBe(`${BASE}/realms/${REALM}`);
  });

  it('encodes the realm name', () => {
    expect(buildIssuerUrl(BASE, 'My Realm')).toBe(`${BASE}/realms/My%20Realm`);
  });
});

describe('endpoint builders', () => {
  it('builds authorization endpoint', () => {
    expect(buildAuthorizationEndpoint(BASE, REALM)).toBe(
      `${BASE}/realms/${REALM}/protocol/openid-connect/auth`,
    );
  });

  it('builds token endpoint', () => {
    expect(buildTokenEndpoint(BASE, REALM)).toBe(
      `${BASE}/realms/${REALM}/protocol/openid-connect/token`,
    );
  });

  it('builds userinfo endpoint', () => {
    expect(buildUserInfoEndpoint(BASE, REALM)).toBe(
      `${BASE}/realms/${REALM}/protocol/openid-connect/userinfo`,
    );
  });

  it('builds logout endpoint', () => {
    expect(buildLogoutEndpoint(BASE, REALM)).toBe(
      `${BASE}/realms/${REALM}/protocol/openid-connect/logout`,
    );
  });
});

describe('buildAuthorizationUrl', () => {
  it('builds a minimal authorization URL with required fields', () => {
    const url = buildAuthorizationUrl({
      baseUrl: BASE,
      realm: REALM,
      clientId: CLIENT,
      redirectUri: REDIRECT,
    });
    expect(url).toContain(`${BASE}/realms/${REALM}/protocol/openid-connect/auth?`);
    expect(url).toContain(`client_id=${CLIENT}`);
    expect(url).toContain('response_type=code');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8082');
  });

  it('includes scope when provided', () => {
    const url = buildAuthorizationUrl({
      baseUrl: BASE,
      realm: REALM,
      clientId: CLIENT,
      redirectUri: REDIRECT,
      scope: 'openid profile email',
    });
    expect(url).toContain('scope=openid+profile+email');
  });

  it('includes state when provided', () => {
    const url = buildAuthorizationUrl({
      baseUrl: BASE,
      realm: REALM,
      clientId: CLIENT,
      redirectUri: REDIRECT,
      state: 'xyz',
    });
    expect(url).toContain('state=xyz');
  });

  it('omits scope when empty', () => {
    const url = buildAuthorizationUrl({
      baseUrl: BASE,
      realm: REALM,
      clientId: CLIENT,
      redirectUri: REDIRECT,
      scope: '',
    });
    expect(url).not.toContain('scope=');
  });

  it('omits state when empty', () => {
    const url = buildAuthorizationUrl({
      baseUrl: BASE,
      realm: REALM,
      clientId: CLIENT,
      redirectUri: REDIRECT,
      state: '',
    });
    expect(url).not.toContain('state=');
  });

  it('includes PKCE challenge when provided, defaulting method to S256', () => {
    const url = buildAuthorizationUrl({
      baseUrl: BASE,
      realm: REALM,
      clientId: CLIENT,
      redirectUri: REDIRECT,
      codeChallenge: 'CHALLENGE',
    });
    expect(url).toContain('code_challenge=CHALLENGE');
    expect(url).toContain('code_challenge_method=S256');
  });

  it('respects explicit codeChallengeMethod', () => {
    const url = buildAuthorizationUrl({
      baseUrl: BASE,
      realm: REALM,
      clientId: CLIENT,
      redirectUri: REDIRECT,
      codeChallenge: 'C',
      codeChallengeMethod: 'plain',
    });
    expect(url).toContain('code_challenge_method=plain');
  });

  it('omits PKCE fields when codeChallenge is empty', () => {
    const url = buildAuthorizationUrl({
      baseUrl: BASE,
      realm: REALM,
      clientId: CLIENT,
      redirectUri: REDIRECT,
      codeChallenge: '',
    });
    expect(url).not.toContain('code_challenge=');
    expect(url).not.toContain('code_challenge_method=');
  });
});
