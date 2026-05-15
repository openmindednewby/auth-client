/**
 * React entry point for `@dloizides/auth-client`.
 *
 * Imported as:
 *
 * ```ts
 * import { useSessions, useForgotPassword } from '@dloizides/auth-client/react';
 * ```
 *
 * This entry pulls in `react` and `@tanstack/react-query` (declared as peer
 * dependencies so consumers control versions). Non-React consumers import
 * from the package root and never load this module.
 */
export { useForgotPassword, type UseForgotPasswordOptions } from './hooks/useForgotPassword';
export { useResetPassword, type UseResetPasswordOptions } from './hooks/useResetPassword';
export { useSessions, SESSIONS_QUERY_KEY, type UseSessionsOptions } from './hooks/useSessions';
export { useRevokeSession, type UseRevokeSessionOptions } from './hooks/useRevokeSession';
export { useLogoutEverywhere, type UseLogoutEverywhereOptions } from './hooks/useLogoutEverywhere';
