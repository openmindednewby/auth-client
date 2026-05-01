import type { KeycloakRoles } from './KeycloakRoles';
import type { KeycloakUserInfo } from './KeycloakUserInfo';

/**
 * Application-friendly view of a Keycloak user.
 *
 * Consumers should prefer this over {@link KeycloakUserInfo} for rendering and
 * authorization checks: it has predictable fields and a deduplicated roles array.
 */
export interface NormalizedUser {
  id?: string;
  username?: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  roles: KeycloakRoles[];
  raw?: KeycloakUserInfo;
}
