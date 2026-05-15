import { useMutation, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query';

import type { AuthApiClient, ResetPasswordRequest } from '../api/AuthApiClient';

export interface UseResetPasswordOptions
  extends Omit<UseMutationOptions<void, Error, ResetPasswordRequest>, 'mutationFn'> {
  api: AuthApiClient;
}

/**
 * React Query mutation that POSTs to `/auth/reset-password`.
 *
 * On success, the user can log in with the new password. The backend
 * also revokes existing sessions, so any other devices stay logged in until
 * their access token expires (mobile) or the cookie is cleared (web).
 */
export function useResetPassword(
  options: UseResetPasswordOptions,
): UseMutationResult<void, Error, ResetPasswordRequest> {
  const { api, ...rest } = options;
  return useMutation<void, Error, ResetPasswordRequest>({
    mutationFn: (request) => api.resetPassword(request),
    ...rest,
  });
}
