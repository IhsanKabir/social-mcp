import { describe, it, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDashboardServer } from '../../src/web/server.js';
import { upsertAccount } from '../../src/services/account-registry.js';
import { createPost } from '../../src/queue/posts-repo.js';

let server: Server | null = null;

function start(): Promise<string> {
  server = createDashboardServer();
  return new Promise((resolve) => {
    server!.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`),
    );
  });
}

afterEach(() => {
  server?.close();
  server = null;
});

describe('dashboard server', () => {
  it('serves the HTML page', async () => {
    const base = await start();
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('social');
  });

  it('serves JSON endpoints reflecting state', async () => {
    const acct = upsertAccount({ platform: 'facebook', label: 'dash' });
    createPost({ accountId: acct.id, platform: 'facebook', text: 'hi', schedulingMode: 'native' });
    const base = await start();

    const accounts = (await (await fetch(`${base}/api/accounts`)).json()) as { id: string }[];
    expect(accounts.some((a) => a.id === acct.id)).toBe(true);

    const queue = (await (await fetch(`${base}/api/queue`)).json()) as unknown[];
    expect(queue.length).toBeGreaterThan(0);

    const status = (await (await fetch(`${base}/api/status`)).json()) as { running: boolean };
    expect(typeof status.running).toBe('boolean');

    expect(Array.isArray(await (await fetch(`${base}/api/insights`)).json())).toBe(true);
    expect(Array.isArray(await (await fetch(`${base}/api/mentions`)).json())).toBe(true);
  });

  it('cancels a post via POST and 404s unknowns', async () => {
    const acct = upsertAccount({ platform: 'linkedin', label: 'dc' });
    const post = createPost({ accountId: acct.id, platform: 'linkedin', text: 'x', schedulingMode: 'local' });
    const base = await start();

    const ok = (await (await fetch(`${base}/api/cancel?postId=${post.id}`, { method: 'POST' })).json()) as {
      canceled: boolean;
    };
    expect(ok.canceled).toBe(true);

    const missing = await fetch(`${base}/api/cancel?postId=nope`, { method: 'POST' });
    expect(missing.status).toBe(404);

    const notFound = await fetch(`${base}/nope`);
    expect(notFound.status).toBe(404);
  });
});
