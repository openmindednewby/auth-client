/**
 * @jest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';

import { useSessions, SESSIONS_QUERY_KEY } from './useSessions';
import { AuthApiClient } from '../api/AuthApiClient';

import type { HttpClient, HttpResponse } from '../http/HttpClient';

function buildHttp(responses: HttpResponse[] | HttpResponse): HttpClient {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  return () => Promise.resolve(queue.shift() ?? { status: 200, ok: true });
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

describe('useSessions', () => {
  it('exports the SESSIONS_QUERY_KEY constant', () => {
    expect(SESSIONS_QUERY_KEY).toEqual(['auth', 'sessions']);
  });

  it('returns the session list on success', async () => {
    const sessions = [{ id: 'a', isCurrent: true }, { id: 'b' }];
    const http = buildHttp({ status: 200, ok: true, data: sessions });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSessions({ api }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(sessions);
  });

  it('surfaces backend errors', async () => {
    const http = buildHttp({ status: 401, ok: false });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSessions({ api }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('listSessions failed');
  });
});
