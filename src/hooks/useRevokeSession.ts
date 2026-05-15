import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';

import { SESSIONS_QUERY_KEY } from './useSessions';

import type { AuthApiClient } from '../api/AuthApiClient';

export interface UseRevokeSessionOptions
  extends Omit<UseMutationOptions<void, Error, string>, 'mutationFn'> {
  api: AuthApiClient;
}

/**
 * React Query mutation that POSTs to `/me/sessions/{id}/revoke`. Pass the
 * session id as the variable. Automatically invalidates the sessions query.
 */
export function useRevokeSession(
  options: UseRevokeSessionOptions,
): UseMutationResult<void, Error, string> {
  const { api, ...rest } = options;
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (sessionId) => api.revokeSession(sessionId),
    ...rest,
    onSuccess: (data, variables, onMutateResult, context) => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
      if (rest.onSuccess !== undefined) {
        rest.onSuccess(data, variables, onMutateResult, context);
      }
    },
  });
}
