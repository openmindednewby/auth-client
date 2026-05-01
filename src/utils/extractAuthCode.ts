/**
 * Loose shape of an `expo-auth-session` (or browser-side) authorization response.
 *
 * Kept as a structural type rather than importing from `expo-auth-session` so
 * the package stays usable in plain web apps and Node tests.
 */
export interface AuthorizationResponseLike {
  type?: string;
  params?: { code?: string; error?: string };
}

/**
 * Pull the authorization `code` out of a successful redirect response.
 *
 * Returns `undefined` when the response is missing, indicates an error type,
 * or doesn't carry a non-empty `code` query param.
 */
export function extractAuthCode(
  response: AuthorizationResponseLike | null | undefined,
): string | undefined {
  if (!response) {
    return undefined;
  }
  if (response.type !== 'success') {
    return undefined;
  }
  const code = response.params?.code;
  if (typeof code !== 'string' || code === '') {
    return undefined;
  }
  return code;
}
