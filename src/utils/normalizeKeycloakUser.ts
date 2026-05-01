import { KeycloakRoles } from '../types/KeycloakRoles';

import type { KeycloakUserInfo } from '../types/KeycloakUserInfo';
import type { NormalizedUser } from '../types/NormalizedUser';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (isNonEmptyString(v)) {
      return v;
    }
  }
  return undefined;
}

function collectRoles(u: KeycloakUserInfo): KeycloakRoles[] {
  const roles: KeycloakRoles[] = [];
  const realmAccessRoles = u.realm_access?.roles;
  if (Array.isArray(realmAccessRoles)) {
    roles.push(...realmAccessRoles);
  }

  const resourceAccess = u.resource_access;
  if (resourceAccess !== undefined) {
    for (const v of Object.values(resourceAccess)) {
      const resourceRoles = v.roles;
      if (Array.isArray(resourceRoles)) {
        roles.push(...resourceRoles);
      }
    }
  }
  return roles;
}

/**
 * Convert a Keycloak `/userinfo` payload into a flat, app-friendly user object.
 *
 * - Aggregates `realm_access.roles` and every `resource_access[*].roles` into a
 *   deduplicated `roles` array.
 * - Picks a sensible `displayName` / `username` from whatever claims are
 *   present (Keycloak realms vary in which fields they emit).
 * - Returns a safe default (`{ roles: [] }`) when input is undefined.
 */
export function normalizeKeycloakUser(u?: KeycloakUserInfo): NormalizedUser {
  if (!u) {
    return { roles: [] };
  }
  const roles = collectRoles(u);
  const fullName = [u.given_name, u.family_name].filter(isNonEmptyString).join(' ');
  const username = firstNonEmptyString(u.preferred_username, u.name, u.email, u.sub);
  const displayName = firstNonEmptyString(u.name, fullName, u.preferred_username, u.email, u.sub);

  return {
    id: u.sub,
    username,
    email: u.email,
    displayName,
    firstName: u.given_name,
    lastName: u.family_name,
    emailVerified: Boolean(u.email_verified),
    roles: Array.from(new Set(roles)),
    raw: u,
  };
}
