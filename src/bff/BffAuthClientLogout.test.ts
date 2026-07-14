/**
 * @jest-environment jsdom
 */
import { BffAuthClient } from './BffAuthClient';

import type { HttpClient, HttpRequest, HttpResponse } from '../http/HttpClient';

interface MockHttpResult {
  http: HttpClient;
  calls: HttpRequest[];
}

function createMockHttp(responses: HttpResponse[] | HttpResponse): MockHttpResult {
  const calls: HttpRequest[] = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const http: HttpClient = (request) => {
    calls.push(request);
    const next = queue.shift() ?? { status: 200, ok: true };
    return Promise.resolve(next);
  };
  return { http, calls };
}

/**
 * Regression suite for the sign-out defect: clearing the BFF cookie alone left the IdP's own
 * browser cookie alive, so the next authorize SILENTLY re-authenticated the user who had just
 * signed out. Only a top-level navigation to the IdP can end that session.
 *
 * These assert the OUTCOME (the browser is navigated to the IdP) rather than merely that
 * `POST /bff/logout` was called — the old test asserted exactly that, and passed, while the user
 * stayed signed in.
 */
describe('BffAuthClient.logout — IdP front-channel sign-out', () => {
  const LOGOUT_URL = 'https://identity.example.com/realms/r/protocol/openid-connect/logout?id_token_hint=t';

  const withLogoutUrl: HttpResponse = {
    status: 200,
    ok: true,
    data: { success: true, idpLogoutUrl: LOGOUT_URL },
  };

  let assign: jest.Mock;
  let originalLocation: Location;

  beforeEach(() => {
    assign = jest.fn();
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('NAVIGATES the browser to the IdP when the BFF returns an idpLogoutUrl', async () => {
    const mock = createMockHttp(withLogoutUrl);
    const client = new BffAuthClient({ http: mock.http });

    await client.logout();

    // The whole point. A fetch here would carry no IdP cookie and change nothing — the IdP
    // session would survive and silently sign the user back in.
    expect(assign).toHaveBeenCalledWith(LOGOUT_URL);
  });

  it('returns the URL and does NOT navigate when redirect is false', async () => {
    const mock = createMockHttp(withLogoutUrl);
    const client = new BffAuthClient({ http: mock.http });

    const url = await client.logout({ redirect: false });

    expect(url).toBe(LOGOUT_URL);
    expect(assign).not.toHaveBeenCalled();
  });

  it('does NOT navigate for a back-channel session (no idpLogoutUrl)', async () => {
    // ROPC / OTP / device-PIN never sent the browser to the IdP, so there is no IdP cookie and
    // no redirect is warranted. Those logouts must behave exactly as they always did.
    const mock = createMockHttp({ status: 200, ok: true, data: { success: true, idpLogoutUrl: null } });
    const client = new BffAuthClient({ http: mock.http });

    const url = await client.logout();

    expect(url).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('does NOT navigate against an older BFF that omits the field entirely', async () => {
    // Forward-compat: a new client against a BFF on an engine < 1.9.0 degrades to the old
    // behaviour rather than crashing or navigating somewhere undefined.
    const mock = createMockHttp({ status: 200, ok: true, data: { success: true } });
    const client = new BffAuthClient({ http: mock.http });

    const url = await client.logout();

    expect(url).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });
});
