import { KeycloakRoles } from '../types/KeycloakRoles';
import { normalizeKeycloakUser } from './normalizeKeycloakUser';

import type { KeycloakUserInfo } from '../types/KeycloakUserInfo';

describe('normalizeKeycloakUser', () => {
  it('returns empty roles object when input is undefined', () => {
    expect(normalizeKeycloakUser(undefined)).toEqual({ roles: [] });
  });

  it('returns empty roles object when input is missing identity claims', () => {
    const result = normalizeKeycloakUser({ roles: [] });
    expect(result.roles).toEqual([]);
    expect(result.id).toBeUndefined();
    expect(result.email).toBeUndefined();
  });

  it('aggregates realm_access roles', () => {
    const input: KeycloakUserInfo = {
      sub: 'user-1',
      roles: [],
      realm_access: { roles: [KeycloakRoles.Admin, KeycloakRoles.User] },
    };
    expect(normalizeKeycloakUser(input).roles).toEqual([KeycloakRoles.Admin, KeycloakRoles.User]);
  });

  it('aggregates resource_access roles across clients', () => {
    const input: KeycloakUserInfo = {
      sub: 'user-1',
      roles: [],
      resource_access: {
        'client-a': { roles: [KeycloakRoles.User] },
        'client-b': { roles: [KeycloakRoles.SuperUser] },
      },
    };
    expect(normalizeKeycloakUser(input).roles).toEqual(
      expect.arrayContaining([KeycloakRoles.User, KeycloakRoles.SuperUser]),
    );
  });

  it('deduplicates roles emitted via both realm_access and resource_access', () => {
    const input: KeycloakUserInfo = {
      sub: 'user-1',
      roles: [],
      realm_access: { roles: [KeycloakRoles.Admin] },
      resource_access: {
        'client-a': { roles: [KeycloakRoles.Admin, KeycloakRoles.User] },
      },
    };
    const result = normalizeKeycloakUser(input);
    expect(result.roles).toHaveLength(2);
    expect(result.roles).toEqual(expect.arrayContaining([KeycloakRoles.Admin, KeycloakRoles.User]));
  });

  it('skips resource_access entries with no roles array', () => {
    const input: KeycloakUserInfo = {
      sub: 'user-1',
      roles: [],
      resource_access: {
        'client-a': {},
      },
    };
    expect(normalizeKeycloakUser(input).roles).toEqual([]);
  });

  it('builds displayName from name when present', () => {
    const input: KeycloakUserInfo = {
      sub: 'user-1',
      name: 'Demetris L',
      given_name: 'Demetris',
      family_name: 'L',
      roles: [],
    };
    expect(normalizeKeycloakUser(input).displayName).toBe('Demetris L');
  });

  it('falls back to "given family" full name when name is missing', () => {
    const input: KeycloakUserInfo = {
      sub: 'user-1',
      given_name: 'Demetris',
      family_name: 'L',
      roles: [],
    };
    expect(normalizeKeycloakUser(input).displayName).toBe('Demetris L');
  });

  it('falls back to email when no name fields are present', () => {
    const input: KeycloakUserInfo = {
      sub: 'user-1',
      email: 'd@example.com',
      roles: [],
    };
    expect(normalizeKeycloakUser(input).displayName).toBe('d@example.com');
  });

  it('falls back to sub when nothing else is present', () => {
    const input: KeycloakUserInfo = {
      sub: 'user-1',
      roles: [],
    };
    expect(normalizeKeycloakUser(input).displayName).toBe('user-1');
    expect(normalizeKeycloakUser(input).username).toBe('user-1');
  });

  it('prefers preferred_username for username', () => {
    const input: KeycloakUserInfo = {
      sub: 'user-1',
      preferred_username: 'demetris',
      email: 'd@example.com',
      roles: [],
    };
    expect(normalizeKeycloakUser(input).username).toBe('demetris');
  });

  it('coerces email_verified to boolean', () => {
    const input: KeycloakUserInfo = { sub: 's', roles: [], email_verified: true };
    expect(normalizeKeycloakUser(input).emailVerified).toBe(true);

    const input2: KeycloakUserInfo = { sub: 's', roles: [] };
    expect(normalizeKeycloakUser(input2).emailVerified).toBe(false);
  });

  it('passes raw payload through', () => {
    const input: KeycloakUserInfo = { sub: 'user-1', roles: [] };
    expect(normalizeKeycloakUser(input).raw).toBe(input);
  });

  it('treats empty-string given/family names as missing for full-name composition', () => {
    const input: KeycloakUserInfo = {
      sub: 'user-1',
      given_name: '',
      family_name: '',
      email: 'd@example.com',
      roles: [],
    };
    expect(normalizeKeycloakUser(input).displayName).toBe('d@example.com');
  });
});
