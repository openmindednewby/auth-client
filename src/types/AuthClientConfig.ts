/**
 * Configuration for {@link AuthClient}.
 *
 * `realm` and `clientId` are **required** and never have sensible portfolio-wide
 * defaults. Each consumer (Questioner web, OnlineMenu web, future apps) supplies
 * its own values. This is the contract that enables the cross-realm hard wall
 * planned in Phase 2 of the product split.
 */
export interface AuthClientConfig {
  /** Keycloak base URL, e.g. `https://identity.dloizides.com`. Trailing slash optional. */
  baseUrl: string;
  /** Realm name, e.g. `OnlineMenu` or `Questioner`. NEVER hardcoded. */
  realm: string;
  /** OAuth client id registered in the realm. */
  clientId: string;
  /** Where Keycloak should redirect after authorization (PKCE / authorization-code flow). */
  redirectUri?: string;
  /** Space-separated OAuth scopes. Defaults to `openid profile email`. */
  scope?: string;
}
