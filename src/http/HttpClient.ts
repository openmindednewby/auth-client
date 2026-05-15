/**
 * Minimal HTTP transport the package depends on.
 *
 * `AuthClient` orchestrates token-related HTTP calls (login, refresh, logout,
 * password reset) but doesn't import `fetch` directly — keeping the package
 * runtime-agnostic. Consumers wire native fetch, axios, ky, or whatever their
 * platform exposes.
 */
export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST' | 'DELETE';
  headers?: Record<string, string>;
  /** When set, body is sent as the request body; serialization is the caller's job. */
  body?: string;
  /** Browser fetch only — pass through `credentials: 'include'` for cookie auth. */
  credentials?: 'include' | 'same-origin' | 'omit';
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  /** Parsed body (already JSON-decoded). `undefined` for 204 / empty bodies. */
  data?: unknown;
}

export type HttpClient = (request: HttpRequest) => Promise<HttpResponse>;

/**
 * Wrap the platform's native `fetch` into the package's `HttpClient` shape.
 * Decoded JSON when `Content-Type` is JSON, otherwise leaves data undefined.
 *
 * Errors thrown by `fetch` (network / abort) are NOT swallowed — callers
 * decide whether to treat them as session-ending.
 */
export function createFetchHttpClient(fetchImpl: typeof fetch): HttpClient {
  return async (request: HttpRequest): Promise<HttpResponse> => {
    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
      body: request.body,
    };
    if (request.credentials !== undefined) {
      init.credentials = request.credentials;
    }
    const response = await fetchImpl(request.url, init);
    let data: unknown;
    if (response.status !== 204) {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        data = (await response.json()) as unknown;
      }
    }
    return {
      status: response.status,
      ok: response.ok,
      data,
    };
  };
}
