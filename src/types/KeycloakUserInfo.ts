import type { KeycloakRoles } from './KeycloakRoles';

/**
 * Shape of the Keycloak `/userinfo` response (and any equivalent payload returned
 * by a backend Identity service that wraps Keycloak).
 *
 * Fields are optional because Keycloak realms can include or omit claims based
 * on scope / mapper configuration. Consumers should narrow before use.
 */
export interface KeycloakUserInfo {
  sub?: string;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  locale?: string;
  tenantId?: string;
  realm_access?: { roles?: KeycloakRoles[] };
  resource_access?: Record<string, { roles?: KeycloakRoles[] }>;
  roles: KeycloakRoles[];
  [key: string]: unknown;
}
