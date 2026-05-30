/**
 * OIDC token-endpoint helpers.
 *
 * Pure (no React, no hooks). Wraps the realm-aware token endpoint with the
 * PKCE `authorization_code` and `refresh_token` grants. The transport is
 * injected so callers can use the HTTP client of their choice.
 *
 * Use these from app-side hooks (e.g. `useKeycloakExchange`) instead of
 * duplicating the body-builder + POST + normalise dance.
 */

import { buildTokenEndpoint } from '../utils/buildKeycloakUrls';
import {
  buildAuthorizationCodeBody,
  buildRefreshTokenBody,
} from '../utils/buildTokenRequestBody';
import { normalizeTokenResponse } from '../utils/normalizeTokenResponse';

import type { HttpClient } from '../http/HttpClient';
import type { RawTokenResponse, TokenResponse } from '../types/TokenResponse';

const FORM_HEADERS: Record<string, string> = {
  'Content-Type': 'application/x-www-form-urlencoded',
};

export interface ExchangeAuthorizationCodeInput {
  http: HttpClient;
  baseUrl: string;
  realm: string;
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface RefreshAccessTokenInput {
  http: HttpClient;
  baseUrl: string;
  realm: string;
  clientId: string;
  refreshToken: string;
}

async function postTokenEndpoint(
  http: HttpClient,
  url: string,
  body: string,
): Promise<TokenResponse> {
  const response = await http({
    url,
    method: 'POST',
    headers: FORM_HEADERS,
    body,
  });
  if (!response.ok) {
    throw new Error(`token endpoint POST failed: ${String(response.status)}`);
  }
  return normalizeTokenResponse(response.data as RawTokenResponse);
}

/**
 * Exchange a PKCE authorization `code` for tokens via the realm's token
 * endpoint (`grant_type=authorization_code`).
 *
 * @throws Error when the HTTP call returns non-2xx or the body is missing
 *         `access_token`.
 */
export async function exchangeAuthorizationCode(
  input: ExchangeAuthorizationCodeInput,
): Promise<TokenResponse> {
  const url = buildTokenEndpoint(input.baseUrl, input.realm);
  const body = buildAuthorizationCodeBody({
    clientId: input.clientId,
    code: input.code,
    redirectUri: input.redirectUri,
    codeVerifier: input.codeVerifier,
  });
  return postTokenEndpoint(input.http, url, body);
}

/**
 * Swap a refresh token for a fresh access/refresh-token pair via the realm's
 * token endpoint (`grant_type=refresh_token`).
 *
 * @throws Error when the HTTP call returns non-2xx or the body is missing
 *         `access_token`.
 */
export async function refreshAccessToken(
  input: RefreshAccessTokenInput,
): Promise<TokenResponse> {
  const url = buildTokenEndpoint(input.baseUrl, input.realm);
  const body = buildRefreshTokenBody({
    clientId: input.clientId,
    refreshToken: input.refreshToken,
  });
  return postTokenEndpoint(input.http, url, body);
}
