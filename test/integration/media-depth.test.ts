import { describe, it, expect, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  publishInstagramReel,
  publishInstagramCarousel,
} from '../../src/adapters/instagram/container.js';
import { publishThreadCarousel } from '../../src/adapters/threads/publish.js';
import { getYouTubeAnalytics } from '../../src/adapters/youtube/reports.js';
import { isVideoAsset } from '../../src/adapters/media-util.js';
import { InstagramAdapter } from '../../src/adapters/instagram/adapter.js';
import { ThreadsAdapter } from '../../src/adapters/threads/adapter.js';

interface Rec {
  method: string;
  path: string;
  query: URLSearchParams;
  body: URLSearchParams;
}

function makeStub(responder: (r: Rec) => unknown) {
  const requests: Rec[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      const u = new URL(req.url ?? '/', 'http://stub');
      const rec: Rec = {
        method: req.method ?? 'GET',
        path: u.pathname,
        query: u.searchParams,
        body: new URLSearchParams(Buffer.concat(chunks).toString('utf8')),
      };
      requests.push(rec);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(responder(rec) ?? {}));
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

describe('media-util', () => {
  it('detects video by mime and extension', () => {
    expect(isVideoAsset({ url: 'https://x/y.mp4' })).toBe(true);
    expect(isVideoAsset({ url: 'https://x/y.MOV?sig=1' })).toBe(true);
    expect(isVideoAsset({ mime: 'video/mp4' })).toBe(true);
    expect(isVideoAsset({ url: 'https://x/y.jpg' })).toBe(false);
  });
});

describe('media depth (stubbed)', () => {
  const servers: Server[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
  });

  it('Instagram Reel: container -> poll FINISHED -> publish', async () => {
    const stub = makeStub((r) => {
      if (r.method === 'GET' && r.query.get('fields') === 'status_code') return { status_code: 'FINISHED' };
      if (r.path.endsWith('/media_publish')) return { id: 'reel_1' };
      return { id: 'cont_1' };
    });
    servers.push(stub.server);
    const base = await listen(stub.server);

    const res = await publishInstagramReel({
      igUserId: 'IG',
      accessToken: 'T',
      videoUrl: 'https://v/clip.mp4',
      caption: 'cap',
      baseUrl: base,
      pollIntervalMs: 5,
      pollTimeoutMs: 1000,
    });
    expect(res.remoteId).toBe('reel_1');
    const create = stub.requests.find((x) => x.path === '/IG/media')!;
    expect(create.body.get('media_type')).toBe('REELS');
    expect(stub.requests.some((x) => x.query.get('fields') === 'status_code')).toBe(true);
  });

  it('Instagram carousel: 2 children -> parent CAROUSEL -> publish', async () => {
    let childCounter = 0;
    const stub = makeStub((r) => {
      if (r.path.endsWith('/media_publish')) return { id: 'car_pub' };
      if (r.path === '/IG/media') {
        childCounter += 1;
        return { id: `c${childCounter}` };
      }
      return {};
    });
    servers.push(stub.server);
    const base = await listen(stub.server);

    const res = await publishInstagramCarousel({
      igUserId: 'IG',
      accessToken: 'T',
      items: [
        { url: 'https://i/1.jpg', isVideo: false },
        { url: 'https://i/2.jpg', isVideo: false },
      ],
      caption: 'album',
      baseUrl: base,
    });
    expect(res.remoteId).toBe('car_pub');
    const parent = stub.requests.find((x) => x.body.get('media_type') === 'CAROUSEL')!;
    expect(parent.body.get('children')).toBe('c1,c2');
  });

  it('Threads carousel: children -> parent CAROUSEL -> publish', async () => {
    let n = 0;
    const stub = makeStub((r) => {
      if (r.path.endsWith('/threads_publish')) return { id: 'th_car' };
      if (r.path === '/U/threads') {
        n += 1;
        return { id: `tc${n}` };
      }
      return {};
    });
    servers.push(stub.server);
    const base = await listen(stub.server);

    const res = await publishThreadCarousel({
      userId: 'U',
      accessToken: 'T',
      items: [
        { url: 'https://i/1.jpg', isVideo: false },
        { url: 'https://i/2.jpg', isVideo: false },
      ],
      text: 'thread album',
      baseUrl: base,
    });
    expect(res.remoteId).toBe('th_car');
    const parent = stub.requests.find((x) => x.body.get('media_type') === 'CAROUSEL')!;
    expect(parent.body.get('children')).toBe('tc1,tc2');
  });

  it('YouTube analytics: returns time-series columns and rows', async () => {
    const stub = makeStub(() => ({
      columnHeaders: [{ name: 'day' }, { name: 'views' }],
      rows: [
        ['2026-06-01', 100],
        ['2026-06-02', 150],
      ],
    }));
    servers.push(stub.server);
    const base = await listen(stub.server);

    const out = await getYouTubeAnalytics('T', {
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      baseUrl: base,
    });
    expect(out.columns).toEqual(['day', 'views']);
    expect(out.rows).toHaveLength(2);
    const req = stub.requests[0]!;
    expect(req.query.get('ids')).toBe('channel==MINE');
    expect(req.query.get('dimensions')).toBe('day');
  });
});

describe('adapter media dispatch (fetch-mocked)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function mock(router: (url: string, method: string) => unknown): void {
    vi.stubGlobal('fetch', async (url: unknown, init: { method?: string } = {}) => {
      const out = router(String(url), init.method ?? 'GET');
      return new Response(JSON.stringify(out ?? {}), {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
      });
    });
  }

  it('Instagram dispatches a single video to a Reel', async () => {
    mock((u) => {
      if (u.includes('fields=status_code')) return { status_code: 'FINISHED' };
      if (u.includes('/media_publish')) return { id: 'reel' };
      return { id: 'c' };
    });
    const r = await new InstagramAdapter().publish(
      { accountId: 'x', text: 'cap', idempotencyKey: 'k', media: [{ url: 'https://v/x.mp4' }] },
      { accessToken: 'T', meta: { igUserId: 'IG' } },
    );
    expect(r.remoteId).toBe('reel');
  });

  it('Instagram dispatches multiple media to a carousel', async () => {
    mock((u) => (u.includes('/media_publish') ? { id: 'cp' } : { id: 'c' }));
    const r = await new InstagramAdapter().publish(
      {
        accountId: 'x',
        idempotencyKey: 'k',
        media: [{ url: 'https://i/1.jpg' }, { url: 'https://i/2.jpg' }],
      },
      { accessToken: 'T', meta: { igUserId: 'IG' } },
    );
    expect(r.remoteId).toBe('cp');
  });

  it('Threads dispatches a single video', async () => {
    mock((u) => {
      if (u.includes('fields=status')) return { status: 'FINISHED' };
      if (u.includes('/threads_publish')) return { id: 'tv' };
      return { id: 'tc' };
    });
    const r = await new ThreadsAdapter().publish(
      { accountId: 'x', text: 't', idempotencyKey: 'k', media: [{ url: 'https://v/x.mp4' }] },
      { accessToken: 'T', meta: { threadsUserId: 'U' } },
    );
    expect(r.remoteId).toBe('tv');
  });

  it('Threads dispatches multiple media to a carousel', async () => {
    mock((u) => (u.includes('/threads_publish') ? { id: 'tcar' } : { id: 'tc' }));
    const r = await new ThreadsAdapter().publish(
      {
        accountId: 'x',
        text: 't',
        idempotencyKey: 'k',
        media: [{ url: 'https://i/1.jpg' }, { url: 'https://i/2.jpg' }],
      },
      { accessToken: 'T', meta: { threadsUserId: 'U' } },
    );
    expect(r.remoteId).toBe('tcar');
  });
});
