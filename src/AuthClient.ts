import {
  buildAuthorizationEndpoint,
  buildAuthorizationUrl,
  buildIssuerUrl,
  buildLogoutEndpoint,
  buildTokenEndpoint,
  buildUserInfoEndpoint,
} from './utils/buildKeycloakUrls';
import { isTokenExpired } from './utils/isTokenExpired';
import { parseBaseUrlFromIssuer, parseRealmFromIssuer } from './utils/parseRealmFromIssuer';

import type { AuthClientConfig } from './types/AuthClientConfig';
import type { AuthTokens } from './types/AuthTokens';
import type { TokenStorage } from './types/TokenStorage';

const DEFAULT_SCOPE = 'openid profile email';

/**
 * Inputs to {@link AuthClient.fromIssuerUrl}.
 *
 * Used by consumers that store only an issuer URL and want to derive `realm`
 * + `baseUrl` rather than configure them separately.
 */
export interface AuthClientFromIssuerInput {
  issuerUrl: string;
  clientId: string;
  redirectUri?: string;
  scope?: string;
}

export class AuthClient {
  private readonly config: AuthClientConfig;
  private readonly tokenStorage: TokenStorage;

  /**
   * @throws Error when `baseUrl`, `realm`, or `clientId` is missing or empty.
   */
  constructor(config: AuthClientConfig, storage: TokenStorage) {
    AuthClient.validateConfig(config);
    this.config = {
      ...config,
      scope: config.scope ?? DEFAULT_SCOPE,
    };
    this.tokenStorage = storage;
  }

  /**
   * Build an {@link AuthClient} from a standalone issuer URL by parsing the
   * realm and base URL. Useful when migrating from the legacy
   * `KEYCLOAK_ISSUER` env var convention.
   *
   * @throws Error when the issuer URL doesn't match `{base}/realms/{realm}`.
   */
  static fromIssuerUrl(input: AuthClientFromIssuerInput, storage: TokenStorage): AuthClient {
    const realm = parseRealmFromIssuer(input.issuerUrl);
    const baseUrl = parseBaseUrlFromIssuer(input.issuerUrl);
    if (realm === null || baseUrl === null || baseUrl === '') {
      throw new Error(`AuthClient.fromIssuerUrl: cannot parse realm from "${input.issuerUrl}"`);
    }
    return new AuthClient(
      {
        baseUrl,
        realm,
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        scope: input.scope,
      },
      storage,
    );
  }

  private static validateConfig(config: AuthClientConfig): void {
    if (typeof config.baseUrl !== 'string' || config.baseUrl === '') {
      throw new Error('AuthClient: baseUrl is required');
    }
    if (typeof config.realm !== 'string' || config.realm === '') {
      throw new Error('AuthClient: realm is required');
    }
    if (typeof config.clientId !== 'string' || config.clientId === '') {
      throw new Error('AuthClient: clientId is required');
    }
  }

  get realm(): string {
    return this.config.realm;
  }

  get clientId(): string {
    return this.config.clientId;
  }

  get baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, '');
  }

  get scope(): string {
    // Constructor always materialises a scope (either user-supplied or DEFAULT_SCOPE).
    return this.config.scope as string;
  }

  get redirectUri(): string | undefined {
    return this.config.redirectUri;
  }

  /** Issuer URL: `{baseUrl}/realms/{realm}`. */
  get issuerUrl(): string {
    return buildIssuerUrl(this.baseUrl, this.realm);
  }

  get authorizationEndpoint(): string {
    return buildAuthorizationEndpoint(this.baseUrl, this.realm);
  }

  get tokenEndpoint(): string {
    return buildTokenEndpoint(this.baseUrl, this.realm);
  }

  get userInfoEndpoint(): string {
    return buildUserInfoEndpoint(this.baseUrl, this.realm);
  }

  get logoutEndpoint(): string {
    return buildLogoutEndpoint(this.baseUrl, this.realm);
  }

  /**
   * Build a fully-formed authorization URL the user agent can navigate to.
   *
   * @throws Error when `redirectUri` is not configured.
   */
  buildAuthorizationUrl(input: {
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: 'S256' | 'plain';
  } = {}): string {
    if (typeof this.config.redirectUri !== 'string' || this.config.redirectUri === '') {
      throw new Error('AuthClient.buildAuthorizationUrl: redirectUri is required');
    }
    return buildAuthorizationUrl({
      baseUrl: this.baseUrl,
      realm: this.realm,
      clientId: this.clientId,
      redirectUri: this.config.redirectUri,
      scope: this.scope,
      state: input.state,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
    });
  }

  async getTokens(): Promise<AuthTokens | null> {
    return this.tokenStorage.read();
  }

  async setTokens(tokens: AuthTokens): Promise<void> {
    return this.tokenStorage.write(tokens);
  }

  async clearTokens(): Promise<void> {
    return this.tokenStorage.clear();
  }

  /**
   * Read the current access token if it exists and is not expired.
   * Returns `null` for "no usable token".
   */
  async getAccessToken(now: number = Date.now()): Promise<string | null> {
    const tokens = await this.tokenStorage.read();
    if (tokens === null) {
      return null;
    }
    if (isTokenExpired(tokens, undefined, now)) {
      return null;
    }
    return tokens.accessToken;
  }
}
