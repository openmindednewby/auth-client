/**
 * @jest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';

import { useRevokeSession } from './useRevokeSession';
import { SESSIONS_QUERY_KEY } from './useSessions';
import { AuthApiClient } from '../api/AuthApiClient';

import type { HttpClient, HttpRequest, HttpResponse } from '../http/HttpClient';

function buildHttp(responses: HttpResponse[] | HttpResponse): {
  http: HttpClient;
  calls: HttpRequest[];
} {
  const calls: HttpRequest[] = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const http: HttpClient = (request) => {
    calls.push(request);
    return Promise.resolve(queue.shift() ?? { status: 200, ok: true });
  };
  return { http, calls };
}

function makeWrapper(): {
  wrapper: (props: { children: React.ReactNode }) => React.ReactElement;
  client: QueryClient;
} {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { wrapper: Wrapper, client };
}

describe('useRevokeSession', () => {
  it('POSTs to /me/sessions/{id}/revoke and invalidates the sessions query', async () => {
    const { http, calls } = buildHttp({ status: 200, ok: true });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const { wrapper, client } = makeWrapper();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRevokeSession({ api }), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('session-id');
    });
    expect(calls[0]?.url).toBe('https://api.test/me/sessions/session-id/revoke');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SESSIONS_QUERY_KEY });
  });

  it('surfaces errors', async () => {
    const { http } = buildHttp({ status: 404, ok: false });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useRevokeSession({ api }), { wrapper });
    act(() => {
      result.current.mutate('x');
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('revokeSession failed');
  });

  it('invokes user-supplied onSuccess after invalidation', async () => {
    const { http } = buildHttp({ status: 200, ok: true });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const { wrapper } = makeWrapper();
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useRevokeSession({ api, onSuccess }), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('session-id');
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
