import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { publishFacebookPost } from '../../src/adapters/facebook/publish.js';
import { getFacebookComments, replyFacebook } from '../../src/adapters/facebook/engagement.js';
import { getFacebookInsights } from '../../src/adapters/facebook/insights.js';
import { publishInstagramImage } from '../../src/adapters/instagram/container.js';
import { InstagramAdapter } from '../../src/adapters/instagram/adapter.js';
import { publishThread } from '../../src/adapters/threads/publish.js';
import { replyThread } from '../../src/adapters/threads/engagement.js';
import { exchangeLongLivedToken } from '../../src/adapters/meta/graph.js';
import { CapabilityError } from '../../src/adapters/capability-error.js';

interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: URLSearchParams;
}

type Responder = (req: RecordedRequest) => { status?: number; json?: unknown };

function makeStub(responder: Responder) {
  const requests: RecordedRequest[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      const u = new URL(req.url ?? '/', 'http://stub');
      const rec: RecordedRequest = {
        method: req.method ?? 'GET',
        path: u.pathname,
        query: u.searchParams,
        body: new URLSearchParams(Buffer.concat(chunks).toString('utf8')),
      };
      requests.push(rec);
      const out = responder(rec);
      res.writeHead(out.status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.json ?? {}));
    });
  });
  return { server, requests };
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    );
  });
}

describe('Meta adapters (stubbed Graph API)', () => {
  const servers: Server[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
  });

  it('Facebook: publishes a text feed post', async () => {
    const stub = makeStub((r) => ({ json: { id: r.path.endsWith('/feed') ? 'fb_1' : 'x' } }));
    servers.push(stub.server);
    const base = await listen(stub.server);

    const result = await publishFacebookPost({
      pageId: 'PAGE',
      accessToken: 'PAGETOK',
      text: 'hello fb',
      baseUrl: base,
    });
    expect(result.remoteId).toBe('fb_1');
    expect(result.state).toBe('published');
    const req = stub.requests[0]!;
    expect(req.path).toBe('/PAGE/feed');
    expect(req.body.get('message')).toBe('hello fb');
    expect(req.body.get('access_token')).toBe('PAGETOK');
    expect(req.body.get('published')).toBeNull();
  });

  it('Facebook: native-schedules a post', async () => {
    const stub = makeStub(() => ({ json: { id: 'fb_2' } }));
    servers.push(stub.server);
    const base = await listen(stub.server);

    const at = new Date(Date.now() + 3_600_000);
    const result = await publishFacebookPost({
      pageId: 'PAGE',
      accessToken: 'T',
      text: 'later',
      scheduledAt: at,
      baseUrl: base,
    });
    expect(result.state).toBe('scheduled');
    const req = stub.requests[0]!;
    expect(req.body.get('published')).toBe('false');
    expect(Number(req.body.get('scheduled_publish_time'))).toBe(Math.floor(at.getTime() / 1000));
  });

  it('Facebook: posts an image via /photos with caption', async () => {
    const stub = makeStub(() => ({ json: { post_id: 'pp_1', id: 'media_1' } }));
    servers.push(stub.server);
    const base = await listen(stub.server);

    const result = await publishFacebookPost({
      pageId: 'PAGE',
      accessToken: 'T',
      text: 'cap',
      imageUrl: 'https://img/x.jpg',
      baseUrl: base,
    });
    expect(result.remoteId).toBe('pp_1');
    const req = stub.requests[0]!;
    expect(req.path).toBe('/PAGE/photos');
    expect(req.body.get('url')).toBe('https://img/x.jpg');
    expect(req.body.get('caption')).toBe('cap');
  });

  it('Facebook: reads comments and replies', async () => {
    const stub = makeStub((r) => {
      if (r.method === 'GET') {
        return {
          json: {
            data: [
              { id: 'c1', message: 'nice', from: { name: 'Bob' }, created_time: '2026-01-01T00:00:00Z' },
            ],
          },
        };
      }
      return { json: { id: 'reply_1' } };
    });
    servers.push(stub.server);
    const base = await listen(stub.server);

    const comments = await getFacebookComments('POST', 'T', base);
    expect(comments[0]!.author).toBe('Bob');
    expect(comments[0]!.text).toBe('nice');

    const reply = await replyFacebook('c1', 'thanks!', 'T', base);
    expect(reply.id).toBe('reply_1');
    const post = stub.requests.find((x) => x.method === 'POST')!;
    expect(post.body.get('message')).toBe('thanks!');
  });

  it('Facebook: reads post insights', async () => {
    const stub = makeStub(() => ({
      json: { data: [{ name: 'post_impressions', values: [{ value: 42 }] }] },
    }));
    servers.push(stub.server);
    const base = await listen(stub.server);

    const insights = await getFacebookInsights('POST', 'PAGE', 'T', base);
    expect(insights.metrics.post_impressions).toBe(42);
    expect(insights.remoteId).toBe('POST');
  });

  it('Instagram: container -> publish two-step', async () => {
    const stub = makeStub((r) => {
      if (r.path.endsWith('/media_publish')) return { json: { id: 'ig_media_1' } };
      if (r.path.endsWith('/media')) return { json: { id: 'container_1' } };
      return { json: {} };
    });
    servers.push(stub.server);
    const base = await listen(stub.server);

    const result = await publishInstagramImage({
      igUserId: 'IGUSER',
      accessToken: 'T',
      imageUrl: 'https://img/p.jpg',
      caption: 'hi ig',
      baseUrl: base,
    });
    expect(result.remoteId).toBe('ig_media_1');

    const create = stub.requests.find((x) => x.path === '/IGUSER/media')!;
    expect(create.body.get('image_url')).toBe('https://img/p.jpg');
    expect(create.body.get('caption')).toBe('hi ig');
    const publish = stub.requests.find((x) => x.path === '/IGUSER/media_publish')!;
    expect(publish.body.get('creation_id')).toBe('container_1');
  });

  it('Instagram: requires an image URL', async () => {
    const adapter = new InstagramAdapter();
    await expect(
      adapter.publish(
        { accountId: 'a', text: 'no image', idempotencyKey: 'k' },
        { accessToken: 'T', meta: { igUserId: 'IG' } },
      ),
    ).rejects.toBeInstanceOf(CapabilityError);
  });

  it('Threads: text post via container -> publish', async () => {
    const stub = makeStub((r) => {
      if (r.path.endsWith('/threads_publish')) return { json: { id: 'th_1' } };
      if (r.path.endsWith('/threads')) return { json: { id: 'tc_1' } };
      return { json: {} };
    });
    servers.push(stub.server);
    const base = await listen(stub.server);

    const result = await publishThread({
      userId: 'TUSER',
      accessToken: 'T',
      text: 'hello threads',
      baseUrl: base,
    });
    expect(result.remoteId).toBe('th_1');
    const create = stub.requests.find((x) => x.path === '/TUSER/threads')!;
    expect(create.body.get('media_type')).toBe('TEXT');
    expect(create.body.get('text')).toBe('hello threads');
  });

  it('Threads: reply sets reply_to_id', async () => {
    const stub = makeStub((r) =>
      r.path.endsWith('/threads_publish') ? { json: { id: 'rep_1' } } : { json: { id: 'rc_1' } },
    );
    servers.push(stub.server);
    const base = await listen(stub.server);

    const reply = await replyThread('TUSER', 'PARENT', 'good point', 'T', base);
    expect(reply.id).toBe('rep_1');
    const create = stub.requests.find((x) => x.path === '/TUSER/threads')!;
    expect(create.body.get('reply_to_id')).toBe('PARENT');
  });

  it('exchanges a short-lived token for a long-lived one', async () => {
    const stub = makeStub(() => ({ json: { access_token: 'LONG', expires_in: 5_184_000 } }));
    servers.push(stub.server);
    const base = await listen(stub.server);

    const res = await exchangeLongLivedToken(
      { clientId: 'cid', clientSecret: 'secret' },
      'SHORT',
      base,
    );
    expect(res.token).toBe('LONG');
    expect(res.expiresAt).toBeGreaterThan(Date.now());
    const req = stub.requests[0]!;
    expect(req.query.get('grant_type')).toBe('fb_exchange_token');
    expect(req.query.get('fb_exchange_token')).toBe('SHORT');
  });
});
