import { describe, it, expect, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishXPost } from '../../src/adapters/x/publish.js';
import { getXReplies, getXMentions, replyX } from '../../src/adapters/x/engagement.js';
import { getXInsights } from '../../src/adapters/x/insights.js';
import { XAdapter } from '../../src/adapters/x/adapter.js';
import { CapabilityError } from '../../src/adapters/capability-error.js';
import { registerBuiltinAuthProviders, getAuthProvider } from '../../src/auth/providers.js';
import type { OAuthOutcome } from '../../src/auth/oauth-manager.js';

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    );
  });
}

describe('X (Twitter) adapter', () => {
  const servers: Server[] = [];
  const tmp: string[] = [];

  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
    for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('publishes a text post and constructs the status URL', async () => {
    let seenBody: any = null;
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        seenBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: { id: '188001', text: seenBody.text } }));
      });
    });
    servers.push(server);
    const base = await listen(server);

    const result = await publishXPost({
      accessToken: 'TOK',
      text: 'Hello from social-mcp!',
      username: 'alice',
      baseUrl: base,
    });

    expect(result.platform).toBe('x');
    expect(result.remoteId).toBe('188001');
    expect(result.url).toBe('https://x.com/alice/status/188001');
    expect(result.state).toBe('published');
    expect(seenBody.text).toBe('Hello from social-mcp!');
  });

  it('uploads local media via v2 initialize/append/finalize then posts', async () => {
    const calls: string[] = [];
    let tweetPayload: any = null;
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        const u = new URL(req.url ?? '/', 'http://stub');
        calls.push(u.pathname);
        if (u.pathname.endsWith('/media/upload/initialize')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: { id: 'med_1' } }));
        } else if (u.pathname.endsWith('/append')) {
          res.writeHead(204);
          res.end();
        } else if (u.pathname.endsWith('/finalize')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: { id: 'med_1', processing_info: { state: 'succeeded' } } }));
        } else if (u.pathname.endsWith('/tweets')) {
          tweetPayload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: { id: 'tw_media_1' } }));
        }
      });
    });
    servers.push(server);
    const base = await listen(server);

    const dir = mkdtempSync(join(tmpdir(), 'x-'));
    tmp.push(dir);
    const img = join(dir, 'pic.png');
    writeFileSync(img, Buffer.from('fake-png-bytes'));

    const res = await publishXPost({
      accessToken: 'TOK',
      text: 'With image',
      media: [{ path: img }],
      baseUrl: base,
    });

    expect(res.remoteId).toBe('tw_media_1');
    expect(calls).toEqual([
      '/media/upload/initialize',
      '/media/upload/med_1/append',
      '/media/upload/med_1/finalize',
      '/tweets',
    ]);
    expect(tweetPayload.media.media_ids).toEqual(['med_1']);
  });

  it('reads replies, mentions, and posts a reply', async () => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        const u = new URL(req.url ?? '/', 'http://stub');
        if (u.pathname === '/tweets/search/recent') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              data: [
                { id: 'root_1', text: 'root', author_id: 'u1', created_at: '2026-11-15T10:00:00Z' },
                { id: 'rep_1', text: 'Nice!', author_id: 'u2', created_at: '2026-11-15T10:05:00Z' },
              ],
              includes: { users: [{ id: 'u2', username: 'bob' }] },
            }),
          );
        } else if (u.pathname === '/users/u1/mentions') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              data: [{ id: 'm_1', text: '@alice hi', author_id: 'u3', created_at: '2026-11-15T11:00:00Z' }],
              includes: { users: [{ id: 'u3', username: 'carol' }] },
            }),
          );
        } else if (u.pathname === '/tweets') {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          expect(body.reply.in_reply_to_tweet_id).toBe('rep_1');
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: { id: 'rep_2' } }));
        }
      });
    });
    servers.push(server);
    const base = await listen(server);

    const replies = await getXReplies('root_1', 'TOK', base);
    expect(replies).toHaveLength(1);
    expect(replies[0]?.author).toBe('@bob');
    expect(replies[0]?.text).toBe('Nice!');

    const mentions = await getXMentions('u1', 'TOK', base);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]?.author).toBe('@carol');

    const sent = await replyX('rep_1', 'Thanks!', 'TOK', base);
    expect(sent.id).toBe('rep_2');
  });

  it('turns 403 tier errors on search/mentions into CapabilityError', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ title: 'Client Forbidden' }));
    });
    servers.push(server);
    const base = await listen(server);

    await expect(getXReplies('root_1', 'TOK', base)).rejects.toBeInstanceOf(CapabilityError);
    await expect(getXMentions('u1', 'TOK', base)).rejects.toBeInstanceOf(CapabilityError);
  });

  it('fetches tweet and account insights with fallback to public_metrics', async () => {
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://stub');
      if (u.pathname === '/tweets/t1' && u.searchParams.get('tweet.fields')?.includes('non_public_metrics')) {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ detail: 'non_public_metrics forbidden' }));
      } else if (u.pathname === '/tweets/t1') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            data: {
              public_metrics: {
                like_count: 12,
                reply_count: 3,
                retweet_count: 2,
                quote_count: 1,
                bookmark_count: 4,
                impression_count: 500,
              },
            },
          }),
        );
      } else if (u.pathname === '/users/u1') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            data: {
              public_metrics: {
                followers_count: 1200,
                following_count: 150,
                tweet_count: 88,
                listed_count: 9,
                like_count: 400,
              },
            },
          }),
        );
      }
    });
    servers.push(server);
    const base = await listen(server);

    const postMetrics = await getXInsights('t1', 'u1', 'TOK', base);
    expect(postMetrics.metrics).toMatchObject({ likes: 12, replies: 3, reposts: 2, impressions: 500 });

    const acctMetrics = await getXInsights(null, 'u1', 'TOK', base);
    expect(acctMetrics.metrics).toMatchObject({ followers: 1200, tweets: 88 });
  });

  it('refreshes tokens using HTTP Basic auth and resolves identity', async () => {
    let sawBasic = '';
    vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      sawBasic = headers.get('authorization') ?? '';
      return new Response(
        JSON.stringify({ access_token: 'NEW_X', expires_in: 7200, refresh_token: 'NR_X' }),
        { status: 200, headers: new Headers({ 'content-type': 'application/json' }) },
      );
    });

    const adapter = new XAdapter();
    const refreshed = await adapter.refreshAuth(
      {
        accountId: 'a1',
        platform: 'x',
        accessToken: 'OLD',
        refreshToken: 'RT',
        scopes: ['tweet.read', 'tweet.write', 'offline.access'],
        obtainedAt: 0,
        meta: { clientId: 'cid', clientSecret: 'csec', userId: 'u1' },
      },
      { platform: 'x', authorizeUrl: '', tokenUrl: '', scopes: [], usePkce: true, tokenAuthMethod: 'basic' },
    );

    expect(sawBasic).toBe(`Basic ${Buffer.from('cid:csec').toString('base64')}`);
    expect(refreshed?.accessToken).toBe('NEW_X');
    expect(refreshed?.refreshToken).toBe('NR_X');

    registerBuiltinAuthProviders();
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ data: { id: 'U99', name: 'Alice', username: 'alice' } }), {
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
        }),
    );
    const outcome: OAuthOutcome = {
      accessToken: 'T',
      refreshToken: 'R',
      expiresAt: Date.now() + 1000,
      scopes: ['tweet.read', 'tweet.write', 'users.read'],
      raw: { access_token: 'T' },
    };
    const id = await getAuthProvider('x').resolveIdentity(outcome, { clientId: 'cid', clientSecret: 'csec' });
    expect(id.remoteId).toBe('U99');
    expect(id.label).toBe('@alice');
    expect(id.meta.userId).toBe('U99');
    expect(id.meta.username).toBe('alice');
  });
});
