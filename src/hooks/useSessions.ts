import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import type { AuthApiClient, AuthSessionInfo } from '../api/AuthApiClient';

export const SESSIONS_QUERY_KEY = ['auth', 'sessions'] as const;

export interface UseSessionsOptions
  extends Omit<UseQueryOptions<AuthSessionInfo[], Error, AuthSessionInfo[]>, 'queryKey' | 'queryFn'> {
  api: AuthApiClient;
}

/**
 * React Query wrapper around `GET /me/sessions`. Returns the active sessions
 * for the current user.
 *
 * Use the exported `SESSIONS_QUERY_KEY` for invalidation from other hooks
 * (e.g., after `useRevokeSession` or `useLogoutEverywhere`).
 */
export function useSessions(options: UseSessionsOptions): UseQueryResult<AuthSessionInfo[], Error> {
  const { api, ...rest } = options;
  return useQuery<AuthSessionInfo[], Error, AuthSessionInfo[]>({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: () => api.listSessions(),
    ...rest,
  });
}
