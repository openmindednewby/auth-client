/**
 * The user `BffAuthClient` hands apps after `GET /bff/me` and the sign-in calls.
 * The BFF returns the sanitised KC claims and never a token; `roles` is always an array.
 */
export interface BffUser {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  tenantId?: string;
  roles?: string[];
  [key: string]: unknown;
}

/** The user as the BFF sends it: a single role arrives as a bare string. */
export interface BffWireUser {
  roles?: unknown;
  [key: string]: unknown;
}

function toRoles(roles: unknown): string[] {
  if (typeof roles === 'string') {
    return roles === '' ? [] : [roles];
  }
  if (Array.isArray(roles)) {
    return roles.filter((role): role is string => typeof role === 'string');
  }
  return [];
}

/** Normalise a wire user so `roles` is always a `string[]`. */
export function toBffUser(wire: BffWireUser): BffUser {
  return { ...wire, roles: toRoles(wire.roles) };
}
