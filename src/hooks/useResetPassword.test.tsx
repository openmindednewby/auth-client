/**
 * @jest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';

import { useResetPassword } from './useResetPassword';
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

describe('useResetPassword', () => {
  it('calls api.resetPassword with the request', async () => {
    const { http, calls } = buildHttp({ status: 200, ok: true });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useResetPassword({ api }), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ token: 'tk', newPassword: 'pw' });
    });
    expect(calls[0]?.url).toBe('https://api.test/auth/reset-password');
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ token: 'tk', newPassword: 'pw' });
  });

  it('surfaces backend errors', async () => {
    const { http } = buildHttp({ status: 400, ok: false });
    const api = new AuthApiClient({ http, baseUrl: 'https://api.test' });
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useResetPassword({ api }), { wrapper });
    act(() => {
      result.current.mutate({ token: 't', newPassword: 'p' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('reset-password failed');
  });
});
