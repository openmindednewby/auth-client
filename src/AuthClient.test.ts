import { AuthClient } from './AuthClient';
import { InMemoryTokenStorage } from './storage/InMemoryTokenStorage';

import type { AuthTokens } from './types/AuthTokens';

const VALID_CONFIG = {
  baseUrl: 'https://identity.dloizides.com',
  realm: 'OnlineMenu',
  clientId: 'online-menu-client',
};

const TOKENS: AuthTokens = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: Number.MAX_SAFE_INTEGER,
};

const EXPIRED_TOKENS: AuthTokens = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: 1, // 1970-ish
};

describe('AuthClient construction', () => {
  it('rejects empty baseUrl', () => {
    expect(() => new AuthClient({ ...VALID_CONFIG, baseUrl: '' }, new InMemoryTokenStorage())).toThrow(
      'baseUrl is required',
    );
  });

  it('rejects empty realm', () => {
    expect(() => new AuthClient({ ...VALID_CONFIG, realm: '' }, new InMemoryTokenStorage())).toThrow(
      'realm is required',
    );
  });

  it('rejects empty clientId', () => {
    expect(() => new AuthClient({ ...VALID_CONFIG, clientId: '' }, new InMemoryTokenStorage())).toThrow(
      'clientId is required',
    );
  });

  it('exposes config via getters', () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(client.realm).toBe('OnlineMenu');
    expect(client.clientId).toBe('online-menu-client');
    expect(client.baseUrl).toBe('https://identity.dloizides.com');
  });

  it('strips trailing slash from baseUrl on read', () => {
    const client = new AuthClient(
      { ...VALID_CONFIG, baseUrl: 'https://identity.dloizides.com/' },
      new InMemoryTokenStorage(),
    );
    expect(client.baseUrl).toBe('https://identity.dloizides.com');
  });

  it('defaults scope when not provided', () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(client.scope).toBe('openid profile email');
  });

  it('uses provided scope when given', () => {
    const client = new AuthClient(
      { ...VALID_CONFIG, scope: 'openid offline_access' },
      new InMemoryTokenStorage(),
    );
    expect(client.scope).toBe('openid offline_access');
  });

  it('exposes redirectUri when configured', () => {
    const client = new AuthClient(
      { ...VALID_CONFIG, redirectUri: 'http://localhost:8082' },
      new InMemoryTokenStorage(),
    );
    expect(client.redirectUri).toBe('http://localhost:8082');
  });

  it('redirectUri is undefined when not configured', () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(client.redirectUri).toBeUndefined();
  });
});

describe('AuthClient endpoint URLs', () => {
  const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());

  it('builds the issuer URL', () => {
    expect(client.issuerUrl).toBe('https://identity.dloizides.com/realms/OnlineMenu');
  });

  it('builds the authorization endpoint', () => {
    expect(client.authorizationEndpoint).toBe(
      'https://identity.dloizides.com/realms/OnlineMenu/protocol/openid-connect/auth',
    );
  });

  it('builds the token endpoint', () => {
    expect(client.tokenEndpoint).toBe(
      'https://identity.dloizides.com/realms/OnlineMenu/protocol/openid-connect/token',
    );
  });

  it('builds the userinfo endpoint', () => {
    expect(client.userInfoEndpoint).toBe(
      'https://identity.dloizides.com/realms/OnlineMenu/protocol/openid-connect/userinfo',
    );
  });

  it('builds the logout endpoint', () => {
    expect(client.logoutEndpoint).toBe(
      'https://identity.dloizides.com/realms/OnlineMenu/protocol/openid-connect/logout',
    );
  });
});

describe('AuthClient.buildAuthorizationUrl', () => {
  it('throws when redirectUri is not configured', () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(() => client.buildAuthorizationUrl()).toThrow('redirectUri is required');
  });

  it('builds an authorization URL with the configured redirectUri and scope', () => {
    const client = new AuthClient(
      { ...VALID_CONFIG, redirectUri: 'http://localhost:8082' },
      new InMemoryTokenStorage(),
    );
    const url = client.buildAuthorizationUrl({ state: 's', codeChallenge: 'c' });
    expect(url).toContain('client_id=online-menu-client');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8082');
    expect(url).toContain('scope=openid+profile+email');
    expect(url).toContain('state=s');
    expect(url).toContain('code_challenge=c');
  });
});

describe('AuthClient.fromIssuerUrl', () => {
  it('parses realm and base URL from the issuer', () => {
    const client = AuthClient.fromIssuerUrl(
      {
        issuerUrl: 'https://identity.dloizides.com/realms/Questioner',
        clientId: 'questioner-client',
      },
      new InMemoryTokenStorage(),
    );
    expect(client.realm).toBe('Questioner');
    expect(client.baseUrl).toBe('https://identity.dloizides.com');
    expect(client.clientId).toBe('questioner-client');
  });

  it('throws when issuer URL has no /realms/ segment', () => {
    expect(() =>
      AuthClient.fromIssuerUrl(
        { issuerUrl: 'https://identity.dloizides.com', clientId: 'c' },
        new InMemoryTokenStorage(),
      ),
    ).toThrow('cannot parse realm');
  });

  it('passes redirectUri and scope through', () => {
    const client = AuthClient.fromIssuerUrl(
      {
        issuerUrl: 'https://identity.dloizides.com/realms/OnlineMenu',
        clientId: 'c',
        redirectUri: 'http://localhost:8082',
        scope: 'openid offline_access',
      },
      new InMemoryTokenStorage(),
    );
    expect(client.redirectUri).toBe('http://localhost:8082');
    expect(client.scope).toBe('openid offline_access');
  });
});

describe('AuthClient token operations', () => {
  it('forwards getTokens / setTokens / clearTokens to storage', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(await client.getTokens()).toBeNull();
    await client.setTokens(TOKENS);
    expect(await client.getTokens()).toEqual(TOKENS);
    await client.clearTokens();
    expect(await client.getTokens()).toBeNull();
  });

  it('getAccessToken returns null when no tokens stored', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    expect(await client.getAccessToken()).toBeNull();
  });

  it('getAccessToken returns null when tokens are expired', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    await client.setTokens(EXPIRED_TOKENS);
    expect(await client.getAccessToken(Date.now())).toBeNull();
  });

  it('getAccessToken returns the access token when not expired', async () => {
    const client = new AuthClient(VALID_CONFIG, new InMemoryTokenStorage());
    await client.setTokens(TOKENS);
    expect(await client.getAccessToken()).toBe('a');
  });
});
