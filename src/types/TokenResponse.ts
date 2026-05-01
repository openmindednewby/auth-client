/**
 * Raw token endpoint response (snake_case, OIDC standard).
 */
export interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  [key: string]: unknown;
}

/**
 * Application-friendly camelCase view of a token endpoint response.
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Seconds until expiry, as returned by Keycloak. */
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}
