/**
 * Roles emitted by Keycloak realms in the dloizides.com portfolio.
 *
 * Lives in its own file per the project convention: each exported `const enum`
 * sits alone so it can be imported without dragging the rest of the type tree.
 */
export const enum KeycloakRoles {
  SuperUser = 'superUser',
  Admin = 'admin',
  User = 'user',
}

const KEYCLOAK_ROLE_VALUES: readonly string[] = [
  KeycloakRoles.SuperUser,
  KeycloakRoles.Admin,
  KeycloakRoles.User,
];

/**
 * Type guard that narrows a string to a known {@link KeycloakRoles} value.
 *
 * Use this when ingesting role claims from the network, where the wire payload
 * is `string[]` but downstream code wants `KeycloakRoles[]`.
 */
export function isKeycloakRole(value: string): value is KeycloakRoles {
  return KEYCLOAK_ROLE_VALUES.includes(value);
}
