import { BffAuthClient } from './BffAuthClient';
import { toBffUser } from './BffUser';

import type { HttpClient, HttpResponse } from '../http/HttpClient';

function clientAnswering(response: HttpResponse): BffAuthClient {
  const http: HttpClient = () => Promise.resolve(response);
  return new BffAuthClient({ http });
}

describe('toBffUser', () => {
  it('with roles as a single string, returns a one-item roles array', () => {
    const wire = { sub: 'u1', roles: 'ComplianceOfficer' };

    const user = toBffUser(wire);

    expect(user.roles).toEqual(['ComplianceOfficer']);
  });

  it('with roles as an array, returns the same roles', () => {
    const wire = { sub: 'u1', roles: ['Admin', 'Analyst'] };

    const user = toBffUser(wire);

    expect(user.roles).toEqual(['Admin', 'Analyst']);
  });

  it('with no roles claim, returns an empty roles array', () => {
    const wire = { sub: 'u1' };

    const user = toBffUser(wire);

    expect(user.roles).toEqual([]);
  });

  it('with an empty roles string, returns an empty roles array', () => {
    const wire = { sub: 'u1', roles: '' };

    const user = toBffUser(wire);

    expect(user.roles).toEqual([]);
  });

  it('with non-string entries in the roles array, keeps only the strings', () => {
    const wire = { sub: 'u1', roles: ['Admin', 7, null] };

    const user = toBffUser(wire);

    expect(user.roles).toEqual(['Admin']);
  });

  it('with other claims, keeps them unchanged', () => {
    const wire = { sub: 'u1', email: 'a@b.c', tenantId: 't1', roles: 'Admin' };

    const user = toBffUser(wire);

    expect(user).toEqual({ sub: 'u1', email: 'a@b.c', tenantId: 't1', roles: ['Admin'] });
  });
});

describe('BffAuthClient.getCurrentUser', () => {
  it('with /bff/me sending roles as a string, returns roles as an array', async () => {
    const client = clientAnswering({ status: 200, ok: true, data: { user: { sub: 'u1', roles: 'Admin' } } });

    const user = await client.getCurrentUser();

    expect(user?.roles).toEqual(['Admin']);
  });
});

describe('BffAuthClient.login', () => {
  it('with the BFF sending roles as a string, returns roles as an array', async () => {
    const client = clientAnswering({ status: 200, ok: true, data: { user: { sub: 'u1', roles: 'Admin' } } });

    const user = await client.login({ username: 'jim', password: 'secret' });

    expect(user.roles).toEqual(['Admin']);
  });
});
