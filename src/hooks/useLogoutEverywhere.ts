import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';

import { SESSIONS_QUERY_KEY } from './useSessions';

import type { AuthClient } from '../AuthClient';

export interface UseLogoutEverywhereOptions
  extends Omit<UseMutationOptions<void, Error, void>, 'mutationFn'> {
  client: AuthClient;
}

/**
 * React Query mutation calling `AuthClient.logout({ everywhere: true })`.
 *
 * Routes through `AuthClient` (not `AuthApiClient` directly) so storage and
 * inactivity tracker are cleared as well. Invalidates the sessions query so
 * any open sessions screen reflects the empty list.
 */
export function useLogoutEverywhere(
  options: UseLogoutEverywhereOptions,
): UseMutationResult<void, Error, void> {
  const { client, ...rest } = options;
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => client.logout({ everywhere: true }),
    ...rest,
    onSuccess: (data, variables, onMutateResult, context) => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
      if (rest.onSuccess !== undefined) {
        rest.onSuccess(data, variables, onMutateResult, context);
      }
    },
  });
}
