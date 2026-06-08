import { describe, it, expect, vi, afterEach } from 'vitest';
import { enqueue, markFailed, retryJob, getJob } from '../../src/queue/job-queue.js';
import { publishInstagramReel } from '../../src/adapters/instagram/container.js';
import { publishThread } from '../../src/adapters/threads/publish.js';

afterEach(() => vi.unstubAllGlobals());

function mockStatus(status: string, key: 'status_code' | 'status'): void {
  vi.stubGlobal('fetch', async (url: unknown, init: { method?: string } = {}) => {
    const u = String(url);
    let body: unknown = { id: 'c' };
    if ((init.method ?? 'GET') === 'GET' && u.includes(`fields=${key}`)) {
      body = { [key]: status };
    } else if (u.includes('_publish')) {
      body = { id: 'pub' };
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
    });
  });
}

describe('queue retry (dead-letter)', () => {
  it('requeues a dead job with a clean slate', () => {
    const job = enqueue({ type: 'publish', payload: { scheduledPostId: 'p' }, maxAttempts: 1 });
    const dead = markFailed(job.id, 'boom'); // maxAttempts 1 -> dead
    expect(dead.status).toBe('dead');

    const retried = retryJob(job.id);
    expect(retried?.status).toBe('queued');
    expect(retried?.attempts).toBe(0);
    expect(retried?.lastError).toBeNull();

    // a non-dead job is not retryable
    expect(retryJob(job.id)).toBeNull();
    expect(getJob(job.id)?.status).toBe('queued');
  });
});

describe('media container polling error paths', () => {
  it('Instagram reel rejects when the container errors', async () => {
    mockStatus('ERROR', 'status_code');
    await expect(
      publishInstagramReel({
        igUserId: 'IG',
        accessToken: 'T',
        videoUrl: 'https://v/x.mp4',
        pollIntervalMs: 1,
        pollTimeoutMs: 500,
      }),
    ).rejects.toThrow(/ERROR/);
  });

  it('Instagram reel times out if never finished', async () => {
    mockStatus('IN_PROGRESS', 'status_code');
    await expect(
      publishInstagramReel({
        igUserId: 'IG',
        accessToken: 'T',
        videoUrl: 'https://v/x.mp4',
        pollIntervalMs: 5,
        pollTimeoutMs: 20,
      }),
    ).rejects.toThrow(/timed out/);
  });

  it('Threads video rejects when the container errors', async () => {
    mockStatus('ERROR', 'status');
    await expect(
      publishThread({
        userId: 'U',
        accessToken: 'T',
        videoUrl: 'https://v/x.mp4',
        pollIntervalMs: 1,
        pollTimeoutMs: 500,
      }),
    ).rejects.toThrow(/ERROR/);
  });
});
