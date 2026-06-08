import { describe, it, expect, vi, afterEach } from 'vitest';
import { FacebookAdapter } from '../../src/adapters/facebook/adapter.js';
import { InstagramAdapter } from '../../src/adapters/instagram/adapter.js';
import { ThreadsAdapter } from '../../src/adapters/threads/adapter.js';
import { YouTubeAdapter } from '../../src/adapters/youtube/adapter.js';
import type { AuthContext } from '../../src/adapters/types.js';

type RouteOut = { status?: number; headers?: Record<string, string>; json?: unknown };
const calls: { url: string; method: string }[] = [];

function mockFetch(router: (url: string, method: string) => RouteOut): void {
  vi.stubGlobal('fetch', async (url: unknown, init: { method?: string } = {}) => {
    const u = String(url);
    const method = init.method ?? 'GET';
    calls.push({ url: u, method });
    const out = router(u, method);
    return new Response(out.json !== undefined ? JSON.stringify(out.json) : '', {
      status: out.status ?? 200,
      headers: new Headers(out.headers ?? {}),
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

const fbAuth: AuthContext = {
  accessToken: 'PAGETOK',
  meta: { pageId: 'PAGE', clientId: 'cid', clientSecret: 'secret' },
};
const igAuth: AuthContext = { accessToken: 'TOK', meta: { igUserId: 'IG', clientId: 'cid', clientSecret: 'sec' } };
const thAuth: AuthContext = { accessToken: 'TOK', meta: { threadsUserId: 'TH' } };
const ytAuth: AuthContext = { accessToken: 'TOK', meta: { channelId: 'CHAN', clientId: 'cid', clientSecret: 'sec' } };
const profile = { platform: 'x' as const, authorizeUrl: '', tokenUrl: '', scopes: [], usePkce: false };

describe('Facebook adapter methods', () => {
  const a = new FacebookAdapter();

  it('publishes text', async () => {
    mockFetch(() => ({ json: { id: 'fb1' } }));
    const r = await a.publish({ accountId: 'x', text: 'hi', idempotencyKey: 'k' }, fbAuth);
    expect(r.remoteId).toBe('fb1');
  });

  it('reads comments, replies, insights', async () => {
    mockFetch((u, m) => {
      if (u.includes('/insights')) return { json: { data: [{ name: 'post_impressions', values: [{ value: 7 }] }] } };
      if (u.includes('/comments') && m === 'GET')
        return { json: { data: [{ id: 'c', message: 'hey', from: { name: 'A' } }] } };
      return { json: { id: 'rep' } };
    });
    expect((await a.getComments('P', fbAuth))[0]!.text).toBe('hey');
    expect((await a.reply('c', 'yo', fbAuth)).id).toBe('rep');
    expect((await a.getInsights('P', fbAuth)).metrics.post_impressions).toBe(7);
  });

  it('refreshes the long-lived token', async () => {
    mockFetch(() => ({ json: { access_token: 'NEW', expires_in: 5184000 } }));
    const refreshed = await a.refreshAuth(
      { accountId: 'x', platform: 'facebook', accessToken: 'OLD', scopes: [], obtainedAt: 0, meta: fbAuth.meta },
      profile,
    );
    expect(refreshed?.accessToken).toBe('NEW');
  });
});

describe('Instagram adapter methods', () => {
  const a = new InstagramAdapter();
  it('publishes an image, reads comments, replies, insights', async () => {
    mockFetch((u, m) => {
      if (u.includes('/media_publish')) return { json: { id: 'igm' } };
      if (u.endsWith('/media')) return { json: { id: 'cont' } };
      if (u.includes('/insights')) return { json: { data: [{ name: 'reach', total_value: { value: 9 } }] } };
      if (u.includes('/comments') && m === 'GET')
        return { json: { data: [{ id: 'c', text: 'nice', username: 'bob' }] } };
      return { json: { id: 'rep' } };
    });
    const pub = await a.publish(
      { accountId: 'x', text: 'cap', idempotencyKey: 'k', media: [{ url: 'https://i/x.jpg' }] },
      igAuth,
    );
    expect(pub.remoteId).toBe('igm');
    expect((await a.getComments('M', igAuth))[0]!.author).toBe('bob');
    expect((await a.reply('c', 'ty', igAuth)).id).toBe('rep');
    expect((await a.getInsights('M', igAuth)).metrics.reach).toBe(9);
  });
});

describe('Threads adapter methods', () => {
  const a = new ThreadsAdapter();
  it('publishes, reads replies, replies, insights, refreshes', async () => {
    mockFetch((u) => {
      if (u.includes('/threads_publish')) return { json: { id: 'th1' } };
      if (u.includes('/threads') && !u.includes('insights')) return { json: { id: 'cont' } };
      if (u.includes('/insights')) return { json: { data: [{ name: 'views', values: [{ value: 3 }] }] } };
      if (u.includes('/replies')) return { json: { data: [{ id: 'r', text: 'hi', username: 'u' }] } };
      if (u.includes('/refresh_access_token')) return { json: { access_token: 'NEW', expires_in: 100 } };
      return { json: {} };
    });
    expect((await a.publish({ accountId: 'x', text: 'hi', idempotencyKey: 'k' }, thAuth)).remoteId).toBe('th1');
    expect((await a.getComments('T', thAuth))[0]!.text).toBe('hi');
    expect((await a.reply('T', 'yo', thAuth)).id).toBe('th1');
    expect((await a.getInsights('T', thAuth)).metrics.views).toBe(3);
    const refreshed = await a.refreshAuth(
      { accountId: 'x', platform: 'threads', accessToken: 'OLD', scopes: [], obtainedAt: 0 },
      profile,
    );
    expect(refreshed?.accessToken).toBe('NEW');
  });
});

describe('YouTube adapter methods', () => {
  const a = new YouTubeAdapter();
  it('reads comments, replies, insights, refreshes', async () => {
    mockFetch((u) => {
      if (u.includes('/commentThreads'))
        return {
          json: {
            items: [
              { snippet: { topLevelComment: { id: 'c', snippet: { authorDisplayName: 'Al', textOriginal: 'g' } } } },
            ],
          },
        };
      if (u.includes('/comments')) return { json: { id: 'r' } };
      if (u.includes('/videos')) return { json: { items: [{ statistics: { viewCount: '10' } }] } };
      if (u.includes('oauth2.googleapis.com/token')) return { json: { access_token: 'NEW', expires_in: 3600 } };
      return { json: {} };
    });
    expect((await a.getComments('V', ytAuth))[0]!.author).toBe('Al');
    expect((await a.reply('c', 'ty', ytAuth)).id).toBe('r');
    expect((await a.getInsights('V', ytAuth)).metrics.viewCount).toBe(10);
    const refreshed = await a.refreshAuth(
      {
        accountId: 'x',
        platform: 'youtube',
        accessToken: 'OLD',
        refreshToken: 'RT',
        scopes: [],
        obtainedAt: 0,
        meta: ytAuth.meta,
      },
      profile,
    );
    expect(refreshed?.accessToken).toBe('NEW');
  });
});
