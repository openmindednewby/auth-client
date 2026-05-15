/**
 * @jest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';

import { useForgotPassword } from './useForgotPassword';
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

function makeWrapper(): (props: { children: React.ReactNode }) => React.ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useForgotPassword', () => {
  it('calls api.forgotPassword with the request', async () => {
    const { http, calls } = buildHttp({ status: 200, ok: true });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useForgotPassword({ api }), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ email: 'a@b.c', tenantId: 't' });
    });
    expect(calls[0]?.url).toBe('https://api.test/auth/forgot-password');
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ email: 'a@b.c', tenantId: 't' });
  });

  it('exposes the failure as an error when the backend rejects', async () => {
    const { http } = buildHttp({ status: 500, ok: false });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useForgotPassword({ api }), { wrapper });
    act(() => {
      result.current.mutate({ email: 'a@b.c' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('forgot-password failed');
  });
});
