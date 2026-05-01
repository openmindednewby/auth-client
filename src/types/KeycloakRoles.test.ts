import { isKeycloakRole, KeycloakRoles } from './KeycloakRoles';

describe('isKeycloakRole', () => {
  it('returns true for known role values', () => {
    expect(isKeycloakRole(KeycloakRoles.SuperUser)).toBe(true);
    expect(isKeycloakRole(KeycloakRoles.Admin)).toBe(true);
    expect(isKeycloakRole(KeycloakRoles.User)).toBe(true);
  });

  it('returns true for the literal string equivalents (used at the wire boundary)', () => {
    expect(isKeycloakRole('superUser')).toBe(true);
    expect(isKeycloakRole('admin')).toBe(true);
    expect(isKeycloakRole('user')).toBe(true);
  });

  it('returns false for unknown roles', () => {
    expect(isKeycloakRole('owner')).toBe(false);
    expect(isKeycloakRole('viewer')).toBe(false);
    expect(isKeycloakRole('')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(isKeycloakRole('Admin')).toBe(false);
    expect(isKeycloakRole('USER')).toBe(false);
  });
});
