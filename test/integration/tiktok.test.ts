import { describe, it, expect, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uploadTikTokDraft } from '../../src/adapters/tiktok/publish.js';
import { TikTokAdapter } from '../../src/adapters/tiktok/adapter.js';
import { registerBuiltinAuthProviders, getAuthProvider } from '../../src/auth/providers.js';
import { CapabilityError } from '../../src/adapters/capability-error.js';
import type { OAuthOutcome } from '../../src/auth/oauth-manager.js';

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    );
  });
}

describe('TikTok degraded adapter', () => {
  const servers: Server[] = [];
  const tmp: string[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
    for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('uploads a video file to the inbox as a draft (FILE_UPLOAD)', async () => {
    let initBody = '';
    let putSeen = false;
    let base = '';
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        const u = new URL(req.url ?? '/', 'http://stub');
        if (u.pathname.endsWith('/inbox/video/init/')) {
          initBody = Buffer.concat(chunks).toString('utf8');
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: { publish_id: 'pub_1', upload_url: `${base}/u/1` } }));
        } else {
          putSeen = req.method === 'PUT';
          res.writeHead(200);
          res.end();
        }
      });
    });
    servers.push(server);
    base = await listen(server);

    const dir = mkdtempSync(join(tmpdir(), 'tt-'));
    tmp.push(dir);
    const file = join(dir, 'v.mp4');
    writeFileSync(file, Buffer.from('vid'));

    const result = await uploadTikTokDraft({ accessToken: 'T', videoPath: file, baseUrl: base });
    expect(result.remoteId).toBe('pub_1');
    expect(result.state).toBe('draft');
    expect(JSON.parse(initBody).source_info.source).toBe('FILE_UPLOAD');
    expect(putSeen).toBe(true);
  });

  it('uploads via PULL_FROM_URL', async () => {
    let initBody = '';
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        initBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: { publish_id: 'pub_2' } }));
      });
    });
    servers.push(server);
    const base = await listen(server);

    const result = await uploadTikTokDraft({
      accessToken: 'T',
      videoUrl: 'https://cdn/x.mp4',
      baseUrl: base,
    });
    expect(result.remoteId).toBe('pub_2');
    expect(JSON.parse(initBody).source_info.source).toBe('PULL_FROM_URL');
    expect(JSON.parse(initBody).source_info.video_url).toBe('https://cdn/x.mp4');
  });

  it('requires a video and gates engagement/analytics', async () => {
    const a = new TikTokAdapter();
    const auth = { accessToken: 'T', meta: { openId: 'o' } };
    await expect(a.publish({ accountId: 'x', text: 'no media', idempotencyKey: 'k' }, auth)).rejects.toBeInstanceOf(
      CapabilityError,
    );
    await expect(a.getComments('v', auth)).rejects.toBeInstanceOf(CapabilityError);
    await expect(a.getInsights(null, auth)).rejects.toBeInstanceOf(CapabilityError);
  });

  it('refreshes the access token', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ access_token: 'NEW', expires_in: 3600, refresh_token: 'NR' }), {
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
        }),
    );
    const a = new TikTokAdapter();
    const refreshed = await a.refreshAuth(
      {
        accountId: 'x',
        platform: 'tiktok',
        accessToken: 'OLD',
        refreshToken: 'R',
        scopes: [],
        obtainedAt: 0,
        meta: { clientId: 'key', clientSecret: 'sec' },
      },
      { platform: 'tiktok', authorizeUrl: '', tokenUrl: '', scopes: [], usePkce: true },
    );
    expect(refreshed?.accessToken).toBe('NEW');
    expect(refreshed?.refreshToken).toBe('NR');
  });

  it('resolves identity from user/info', async () => {
    registerBuiltinAuthProviders();
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ data: { user: { open_id: 'OPEN1', display_name: 'Creator' } } }), {
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
        }),
    );
    const outcome: OAuthOutcome = {
      accessToken: 'T',
      refreshToken: 'R',
      expiresAt: Date.now() + 1000,
      scopes: ['video.upload'],
      raw: { access_token: 'T' },
    };
    const id = await getAuthProvider('tiktok').resolveIdentity(outcome, {
      clientId: 'key',
      clientSecret: 'sec',
    });
    expect(id.remoteId).toBe('OPEN1');
    expect(id.label).toBe('Creator');
    expect(id.meta.openId).toBe('OPEN1');
  });
});

describe('TikTok direct publish, error checking, and insights', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('supports direct publish mode with post_info when video.publish scope is granted', async () => {
    let seenUrl = '';
    let seenBody: any = null;
    vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(
        JSON.stringify({ data: { publish_id: 'pub_direct_1' }, error: { code: 'ok', message: '' } }),
        { status: 200, headers: new Headers({ 'content-type': 'application/json' }) },
      );
    });

    const a = new TikTokAdapter();
    const res = await a.publish(
      {
        accountId: 'acc1',
        text: 'Launch video!',
        visibility: 'public',
        media: [{ url: 'https://cdn.example.com/v.mp4' }],
        idempotencyKey: 'k1',
      },
      {
        accessToken: 'TOK',
        meta: { openId: 'o1', scopes: 'user.info.basic,video.upload,video.publish' },
      },
    );

    expect(seenUrl).toContain('/post/publish/video/init/');
    expect(seenBody.post_info.title).toBe('Launch video!');
    expect(seenBody.post_info.privacy_level).toBe('PUBLIC_TO_EVERYONE');
    expect(res.state).toBe('processing');
    expect(res.remoteId).toBe('pub_direct_1');
  });

  it('throws on TikTok non-ok error payload', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({ error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'Audit needed' } }),
          { status: 200, headers: new Headers({ 'content-type': 'application/json' }) },
        ),
    );
    await expect(
      uploadTikTokDraft({ accessToken: 'T', videoUrl: 'https://cdn/x.mp4', mode: 'direct' }),
    ).rejects.toThrow(/unaudited_client_can_only_post_to_private_accounts/);
  });

  it('fetches account insights when user.info.stats scope is granted', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            data: { user: { follower_count: 50, following_count: 10, likes_count: 200, video_count: 4 } },
            error: { code: 'ok' },
          }),
          { status: 200, headers: new Headers({ 'content-type': 'application/json' }) },
        ),
    );
    const a = new TikTokAdapter();
    const ins = await a.getInsights(null, {
      accessToken: 'TOK',
      meta: { openId: 'o1', scopes: 'user.info.basic,user.info.stats' },
    });
    expect(ins.metrics).toEqual({ followers: 50, following: 10, likes: 200, videos: 4 });
  });
});
