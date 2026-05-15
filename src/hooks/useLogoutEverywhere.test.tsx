/**
 * @jest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';

import { useLogoutEverywhere } from './useLogoutEverywhere';
import { SESSIONS_QUERY_KEY } from './useSessions';
import { AuthClient } from '../AuthClient';
import { AuthApiClient } from '../api/AuthApiClient';
import { InMemoryTokenStorage } from '../storage/InMemoryTokenStorage';

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

const VALID_CONFIG = {
  baseUrl: 'https://identity.dloizides.com',
  realm: 'OnlineMenu',
  clientId: 'online-menu-client',
};

describe('useLogoutEverywhere', () => {
  it('routes through AuthClient.logout({ everywhere: true }) and invalidates sessions', async () => {
    const { http, calls } = buildHttp({ status: 200, ok: true });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const storage = new InMemoryTokenStorage();
    await storage.write({ accessToken: 'a', expiresAt: Number.MAX_SAFE_INTEGER });
    const authClient = new AuthClient(VALID_CONFIG, storage, { api });
    const { wrapper, client } = makeWrapper();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useLogoutEverywhere({ client: authClient }), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(calls[0]?.url).toBe('https://api.test/auth/logout?everywhere=true');
    expect(await storage.read()).toBeNull();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SESSIONS_QUERY_KEY });
  });

  it('surfaces errors from AuthClient.logout', async () => {
    const { http } = buildHttp({ status: 500, ok: false });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const storage = new InMemoryTokenStorage();
    const authClient = new AuthClient(VALID_CONFIG, storage, { api });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useLogoutEverywhere({ client: authClient }), { wrapper });
    act(() => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('logout failed');
  });

  it('forwards user-supplied onSuccess after invalidating', async () => {
    const { http } = buildHttp({ status: 200, ok: true });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const storage = new InMemoryTokenStorage();
    const authClient = new AuthClient(VALID_CONFIG, storage, { api });
    const { wrapper } = makeWrapper();
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useLogoutEverywhere({ client: authClient, onSuccess }), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
