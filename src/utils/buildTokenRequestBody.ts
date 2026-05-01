/**
 * Inputs for the OAuth `authorization_code` token request.
 */
export interface AuthorizationCodeBodyInput {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

/**
 * Inputs for the OAuth `refresh_token` token request.
 */
export interface RefreshTokenBodyInput {
  clientId: string;
  refreshToken: string;
}

/**
 * Build the `application/x-www-form-urlencoded` body for the
 * `grant_type=authorization_code` token endpoint call (PKCE flow).
 */
export function buildAuthorizationCodeBody(input: AuthorizationCodeBodyInput): string {
  return new URLSearchParams({
    client_id: input.clientId,
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  }).toString();
}

/**
 * Build the `application/x-www-form-urlencoded` body for the
 * `grant_type=refresh_token` token endpoint call.
 */
export function buildRefreshTokenBody(input: RefreshTokenBodyInput): string {
  return new URLSearchParams({
    client_id: input.clientId,
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
  }).toString();
}
