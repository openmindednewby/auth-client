import { createFetchHttpClient } from './HttpClient';

interface MockFetchOptions {
  status?: number;
  contentType?: string;
  body?: unknown;
}

function createMockFetch(options: MockFetchOptions = {}): {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const status = options.status ?? 200;
  const contentType = options.contentType ?? 'application/json';
  const body = options.body;
  const fetchImpl = ((url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const headers = new Headers({ 'content-type': contentType });
    const response: Response = {
      status,
      ok: status >= 200 && status < 300,
      headers,
      json: () => Promise.resolve(body),
    } as Response;
    return Promise.resolve(response);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('createFetchHttpClient', () => {
  it('parses JSON response when content-type is application/json', async () => {
    const { fetchImpl } = createMockFetch({ body: { foo: 'bar' } });
    const client = createFetchHttpClient(fetchImpl);
    const response = await client({ url: 'https://x', method: 'GET' });
    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({ foo: 'bar' });
  });

  it('leaves data undefined for 204 No Content', async () => {
    const { fetchImpl } = createMockFetch({ status: 204, contentType: 'application/json' });
    const client = createFetchHttpClient(fetchImpl);
    const response = await client({ url: 'https://x', method: 'GET' });
    expect(response.status).toBe(204);
    expect(response.data).toBeUndefined();
  });

  it('leaves data undefined when content-type is not JSON', async () => {
    const { fetchImpl } = createMockFetch({ contentType: 'text/plain' });
    const client = createFetchHttpClient(fetchImpl);
    const response = await client({ url: 'https://x', method: 'GET' });
    expect(response.data).toBeUndefined();
  });

  it('passes credentials through when provided', async () => {
    const { fetchImpl, calls } = createMockFetch();
    const client = createFetchHttpClient(fetchImpl);
    await client({ url: 'https://x', method: 'POST', credentials: 'include' });
    expect(calls[0]?.init?.credentials).toBe('include');
  });

  it('omits credentials when not provided', async () => {
    const { fetchImpl, calls } = createMockFetch();
    const client = createFetchHttpClient(fetchImpl);
    await client({ url: 'https://x', method: 'POST' });
    expect(calls[0]?.init?.credentials).toBeUndefined();
  });

  it('forwards method, headers, and body', async () => {
    const { fetchImpl, calls } = createMockFetch();
    const client = createFetchHttpClient(fetchImpl);
    await client({
      url: 'https://x',
      method: 'POST',
      headers: { 'X-Test': 'true' },
      body: 'payload',
    });
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers).toEqual({ 'X-Test': 'true' });
    expect(calls[0]?.init?.body).toBe('payload');
  });

  it('marks ok=false for 4xx/5xx', async () => {
    const { fetchImpl } = createMockFetch({ status: 401, body: { error: 'unauthorized' } });
    const client = createFetchHttpClient(fetchImpl);
    const response = await client({ url: 'https://x', method: 'POST' });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(401);
  });

  it('treats missing content-type header as non-JSON (data undefined)', async () => {
    const fetchImpl = ((url: string, init?: RequestInit): Promise<Response> => {
      void url;
      void init;
      const response: Response = {
        status: 200,
        ok: true,
        // headers.get() returns null for missing headers — exercise the `?? ''` branch.
        headers: { get: (): string | null => null } as unknown as Headers,
        json: () => Promise.resolve({}),
      } as Response;
      return Promise.resolve(response);
    }) as unknown as typeof fetch;
    const client = createFetchHttpClient(fetchImpl);
    const response = await client({ url: 'https://x', method: 'GET' });
    expect(response.data).toBeUndefined();
  });
});
