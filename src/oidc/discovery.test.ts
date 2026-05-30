import {
  clearDiscoveryCache,
  fetchDiscoveryDocument,
  type OidcDiscoveryDocument,
} from './discovery';

import type { HttpClient, HttpRequest, HttpResponse } from '../http/HttpClient';

const VALID_DOC: OidcDiscoveryDocument = {
  issuer: 'https://identity.dloizides.com/realms/onlinemenu',
  authorization_endpoint: 'https://identity.dloizides.com/realms/onlinemenu/protocol/openid-connect/auth',
  token_endpoint: 'https://identity.dloizides.com/realms/onlinemenu/protocol/openid-connect/token',
  end_session_endpoint: 'https://identity.dloizides.com/realms/onlinemenu/protocol/openid-connect/logout',
};

interface MockHttp {
  http: HttpClient;
  calls: HttpRequest[];
}

function createMockHttp(responses: HttpResponse[] | HttpResponse): MockHttp {
  const calls: HttpRequest[] = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const http: HttpClient = (request) => {
    calls.push(request);
    const next = queue.shift() ?? { status: 200, ok: true, data: VALID_DOC };
    return Promise.resolve(next);
  };
  return { http, calls };
}

describe('fetchDiscoveryDocument', () => {
  beforeEach(() => {
    clearDiscoveryCache();
  });

  it('fetches the metadata from the well-known endpoint', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: VALID_DOC });
    const doc = await fetchDiscoveryDocument({
      issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu',
      http: mock.http,
    });
    expect(doc).toEqual(VALID_DOC);
    expect(mock.calls[0]?.url).toBe(
      'https://identity.dloizides.com/realms/onlinemenu/.well-known/openid-configuration',
    );
    expect(mock.calls[0]?.method).toBe('GET');
  });

  it('strips trailing slash from the issuer URL', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: VALID_DOC });
    await fetchDiscoveryDocument({
      issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu/',
      http: mock.http,
    });
    expect(mock.calls[0]?.url).toBe(
      'https://identity.dloizides.com/realms/onlinemenu/.well-known/openid-configuration',
    );
  });

  it('caches the metadata per-issuer across multiple calls', async () => {
    const mock = createMockHttp([
      { status: 200, ok: true, data: VALID_DOC },
      { status: 200, ok: true, data: { ...VALID_DOC, issuer: 'mutated' } },
    ]);
    const first = await fetchDiscoveryDocument({
      issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu',
      http: mock.http,
    });
    const second = await fetchDiscoveryDocument({
      issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu',
      http: mock.http,
    });
    expect(first).toEqual(VALID_DOC);
    expect(second).toBe(first);
    expect(mock.calls).toHaveLength(1);
  });

  it('keeps separate cache entries per issuer', async () => {
    const otherDoc = { ...VALID_DOC, issuer: 'https://identity.dloizides.com/realms/questioner' };
    const mock = createMockHttp([
      { status: 200, ok: true, data: VALID_DOC },
      { status: 200, ok: true, data: otherDoc },
    ]);
    await fetchDiscoveryDocument({
      issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu',
      http: mock.http,
    });
    const second = await fetchDiscoveryDocument({
      issuerUrl: 'https://identity.dloizides.com/realms/questioner',
      http: mock.http,
    });
    expect(second.issuer).toBe(otherDoc.issuer);
    expect(mock.calls).toHaveLength(2);
  });

  it('throws on non-2xx response', async () => {
    const mock = createMockHttp({ status: 404, ok: false });
    await expect(
      fetchDiscoveryDocument({
        issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu',
        http: mock.http,
      }),
    ).rejects.toThrow('OIDC discovery failed: 404');
  });

  it('throws when the metadata is missing required fields', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: { issuer: 'x' } });
    await expect(
      fetchDiscoveryDocument({
        issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu',
        http: mock.http,
      }),
    ).rejects.toThrow('invalid metadata');
  });

  it('throws when the metadata is not an object', async () => {
    const mock = createMockHttp({ status: 200, ok: true, data: null });
    await expect(
      fetchDiscoveryDocument({
        issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu',
        http: mock.http,
      }),
    ).rejects.toThrow('invalid metadata');
  });

  it('throws when authorization_endpoint is empty', async () => {
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { ...VALID_DOC, authorization_endpoint: '' },
    });
    await expect(
      fetchDiscoveryDocument({
        issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu',
        http: mock.http,
      }),
    ).rejects.toThrow('invalid metadata');
  });

  it('throws when token_endpoint is missing', async () => {
    const mock = createMockHttp({
      status: 200,
      ok: true,
      data: { issuer: 'x', authorization_endpoint: 'y' },
    });
    await expect(
      fetchDiscoveryDocument({
        issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu',
        http: mock.http,
      }),
    ).rejects.toThrow('invalid metadata');
  });
});

describe('clearDiscoveryCache', () => {
  it('clears the cached entries so the next call refetches', async () => {
    const mock = createMockHttp([
      { status: 200, ok: true, data: VALID_DOC },
      { status: 200, ok: true, data: VALID_DOC },
    ]);
    await fetchDiscoveryDocument({
      issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu',
      http: mock.http,
    });
    clearDiscoveryCache();
    await fetchDiscoveryDocument({
      issuerUrl: 'https://identity.dloizides.com/realms/onlinemenu',
      http: mock.http,
    });
    expect(mock.calls).toHaveLength(2);
  });
});
