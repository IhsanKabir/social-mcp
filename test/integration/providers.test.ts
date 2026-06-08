import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { registerBuiltinAuthProviders, getAuthProvider } from '../../src/auth/providers.js';
import type { OAuthOutcome } from '../../src/auth/oauth-manager.js';

beforeAll(() => registerBuiltinAuthProviders());
afterEach(() => vi.unstubAllGlobals());

function mock(router: (url: string) => unknown): void {
  vi.stubGlobal('fetch', async (url: unknown) => {
    const u = String(url);
    return new Response(JSON.stringify(router(u)), {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
    });
  });
}

const outcome: OAuthOutcome = {
  accessToken: 'SHORT',
  refreshToken: 'RT',
  expiresAt: Date.now() + 1000,
  scopes: ['s'],
  raw: { access_token: 'SHORT' },
};
const creds = { clientId: 'cid', clientSecret: 'secret' };

describe('auth provider identity resolution', () => {
  it('linkedin -> person urn', async () => {
    mock(() => ({ sub: '123', name: 'Jo' }));
    const id = await getAuthProvider('linkedin').resolveIdentity(outcome, creds);
    expect(id.remoteId).toBe('urn:li:person:123');
    expect(id.meta.authorUrn).toBe('urn:li:person:123');
  });

  it('facebook -> stores the page token', async () => {
    mock((u) => {
      if (u.includes('/oauth/access_token')) return { access_token: 'LL', expires_in: 5184000 };
      return { data: [{ id: 'PG', name: 'Page', access_token: 'PT' }] };
    });
    const id = await getAuthProvider('facebook').resolveIdentity(outcome, creds);
    expect(id.remoteId).toBe('PG');
    expect(id.accessToken).toBe('PT');
    expect(id.meta.pageId).toBe('PG');
  });

  it('instagram -> discovers the linked IG business account', async () => {
    mock((u) => {
      if (u.includes('/oauth/access_token')) return { access_token: 'LL', expires_in: 100 };
      if (u.includes('/me/accounts'))
        return { data: [{ id: 'PG', name: 'P', access_token: 'PT', instagram_business_account: { id: 'IGID' } }] };
      return { username: 'iguser' };
    });
    const id = await getAuthProvider('instagram').resolveIdentity(outcome, creds);
    expect(id.remoteId).toBe('IGID');
    expect(id.meta.igUserId).toBe('IGID');
    expect(id.accessToken).toBe('PT');
  });

  it('threads -> exchanges long-lived token and resolves user', async () => {
    mock((u) => {
      if (u.includes('/access_token')) return { access_token: 'TLL', expires_in: 100 };
      return { id: 'THID', username: 'thuser' };
    });
    const id = await getAuthProvider('threads').resolveIdentity(outcome, creds);
    expect(id.remoteId).toBe('THID');
    expect(id.meta.threadsUserId).toBe('THID');
    expect(id.accessToken).toBe('TLL');
  });

  it('youtube -> resolves the channel', async () => {
    mock(() => ({ items: [{ id: 'CHAN', snippet: { title: 'My Chan' } }] }));
    const id = await getAuthProvider('youtube').resolveIdentity(outcome, creds);
    expect(id.remoteId).toBe('CHAN');
    expect(id.label).toBe('My Chan');
    expect(id.meta.channelId).toBe('CHAN');
  });
});
