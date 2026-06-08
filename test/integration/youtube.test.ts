import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uploadYouTubeVideo } from '../../src/adapters/youtube/upload.js';
import { getYouTubeComments, replyYouTube } from '../../src/adapters/youtube/engagement.js';
import { getYouTubeInsights } from '../../src/adapters/youtube/analytics.js';
import { assertUploadQuota, recordUpload, uploadsToday } from '../../src/adapters/youtube/quota.js';
import { YouTubeAdapter } from '../../src/adapters/youtube/adapter.js';
import { CapabilityError } from '../../src/adapters/capability-error.js';

interface Recorded {
  method: string;
  path: string;
  query: URLSearchParams;
  raw: string;
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    );
  });
}

describe('YouTube quota guard', () => {
  it('blocks uploads past the daily max', () => {
    for (let i = 0; i < 6; i += 1) recordUpload();
    expect(uploadsToday()).toBe(6);
    expect(() => assertUploadQuota(6)).toThrow(/quota reached/i);
    expect(() => assertUploadQuota(7)).not.toThrow();
  });
});

describe('YouTube adapter (stubbed Data API)', () => {
  const servers: Server[] = [];
  const tmp: string[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
    for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('resumable upload: init session then PUT bytes (with publishAt when scheduled)', async () => {
    const recs: Recorded[] = [];
    let base = '';
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        const u = new URL(req.url ?? '/', 'http://stub');
        recs.push({
          method: req.method ?? 'GET',
          path: u.pathname,
          query: u.searchParams,
          raw: Buffer.concat(chunks).toString('utf8'),
        });
        if (u.pathname === '/upload/youtube/v3/videos') {
          res.writeHead(200, { location: `${base}/session/1`, 'content-type': 'application/json' });
          res.end('{}');
        } else if (u.pathname === '/session/1') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'vid_1' }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });
    servers.push(server);
    base = await listen(server);

    const dir = mkdtempSync(join(tmpdir(), 'yt-'));
    tmp.push(dir);
    const file = join(dir, 'clip.mp4');
    writeFileSync(file, Buffer.from('fake video bytes'));

    const at = new Date(Date.now() + 7_200_000);
    const result = await uploadYouTubeVideo({
      accessToken: 'TOK',
      filePath: file,
      title: 'My title',
      description: 'desc',
      privacyStatus: 'public',
      publishAt: at,
      baseUrl: base,
    });
    expect(result.id).toBe('vid_1');

    const init = recs.find((r) => r.path === '/upload/youtube/v3/videos')!;
    expect(init.query.get('uploadType')).toBe('resumable');
    const meta = JSON.parse(init.raw);
    expect(meta.snippet.title).toBe('My title');
    expect(meta.status.privacyStatus).toBe('private'); // scheduled => private + publishAt
    expect(meta.status.publishAt).toBe(at.toISOString());

    expect(recs.some((r) => r.method === 'PUT' && r.path === '/session/1')).toBe(true);
  });

  it('reads comments and replies', async () => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        const u = new URL(req.url ?? '/', 'http://stub');
        res.writeHead(200, { 'content-type': 'application/json' });
        if (u.pathname.endsWith('/commentThreads')) {
          res.end(
            JSON.stringify({
              items: [
                {
                  snippet: {
                    topLevelComment: {
                      id: 'c1',
                      snippet: {
                        authorDisplayName: 'Al',
                        textOriginal: 'great video',
                        publishedAt: '2026-01-01T00:00:00Z',
                      },
                    },
                  },
                },
              ],
            }),
          );
        } else {
          res.end(JSON.stringify({ id: 'r1' }));
        }
      });
    });
    servers.push(server);
    const base = await listen(server);

    const comments = await getYouTubeComments('VID', 'TOK', base);
    expect(comments[0]!.author).toBe('Al');
    expect(comments[0]!.id).toBe('c1');

    const reply = await replyYouTube('c1', 'thanks', 'TOK', base);
    expect(reply.id).toBe('r1');
  });

  it('reads video statistics as insights', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: [{ statistics: { viewCount: '1234', likeCount: '56' } }] }));
    });
    servers.push(server);
    const base = await listen(server);

    const insights = await getYouTubeInsights('VID', 'CHAN', 'TOK', base);
    expect(insights.metrics.viewCount).toBe(1234);
    expect(insights.metrics.likeCount).toBe(56);
    expect(insights.remoteId).toBe('VID');
  });

  it('requires a video file', async () => {
    const adapter = new YouTubeAdapter();
    await expect(
      adapter.publish(
        { accountId: 'a', text: 'no video', idempotencyKey: 'k' },
        { accessToken: 'T', meta: { channelId: 'C' } },
      ),
    ).rejects.toBeInstanceOf(CapabilityError);
  });
});
