import { useMutation, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query';

import type { AuthApiClient, ForgotPasswordRequest } from '../api/AuthApiClient';

export interface UseForgotPasswordOptions
  extends Omit<UseMutationOptions<void, Error, ForgotPasswordRequest>, 'mutationFn'> {
  api: AuthApiClient;
}

/**
 * React Query mutation that POSTs to `/auth/forgot-password`.
 *
 * The backend returns 200 unconditionally (no email enumeration). UI should
 * always show "if that email exists, we sent a reset link" regardless of
 * whether `onSuccess` or `onError` fires.
 */
export function useForgotPassword(
  options: UseForgotPasswordOptions,
): UseMutationResult<void, Error, ForgotPasswordRequest> {
  const { api, ...rest } = options;
  return useMutation<void, Error, ForgotPasswordRequest>({
    mutationFn: (request) => api.forgotPassword(request),
    ...rest,
  });
}
