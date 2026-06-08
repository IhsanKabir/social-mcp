import { describe, it, expect } from 'vitest';
import { Daemon } from '../../src/scheduler/daemon.js';
import { processJob } from '../../src/scheduler/due-processor.js';
import { schedulePost } from '../../src/services/post-service.js';
import { enqueue, getJob } from '../../src/queue/job-queue.js';
import { createPost, getPost } from '../../src/queue/posts-repo.js';
import { recordPublish } from '../../src/queue/publish-log.js';
import { upsertAccount } from '../../src/services/account-registry.js';
import { EncryptedTokenStore } from '../../src/auth/stores/encrypted.js';
import { capabilitiesFor } from '../../src/adapters/capabilities.js';
import type { SocialAdapter, PublishResult } from '../../src/adapters/types.js';

const store = new EncryptedTokenStore();

function stubAdapter(opts: { fail?: boolean } = {}) {
  let calls = 0;
  const adapter: SocialAdapter = {
    platform: 'linkedin',
    capabilities: () => capabilitiesFor('linkedin'),
    async publish(): Promise<PublishResult> {
      calls += 1;
      if (opts.fail) throw new Error('stub publish failure');
      return { platform: 'linkedin', remoteId: `urn:li:share:${calls}`, url: 'https://x', state: 'published' };
    },
    async getComments() {
      return [];
    },
    async getMentions() {
      return [];
    },
    async reply() {
      return { id: 'r' };
    },
    async getInsights() {
      return { metrics: {}, pulledAt: new Date() };
    },
    async refreshAuth() {
      return null;
    },
  };
  return { adapter, calls: () => calls };
}

async function connectedAccount(label: string): Promise<string> {
  const acct = upsertAccount({ platform: 'linkedin', label });
  await store.set({
    accountId: acct.id,
    platform: 'linkedin',
    accessToken: 't',
    scopes: [],
    meta: { authorUrn: 'urn:li:person:x' },
    obtainedAt: Date.now(),
  });
  return acct.id;
}

async function waitUntil(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('condition not met within timeout');
}

describe('processJob (publish)', () => {
  it('publishes a queued post and marks it done', async () => {
    const accountId = await connectedAccount('proc1');
    const post = createPost({ accountId, platform: 'linkedin', text: 'hi', schedulingMode: 'local' });
    const job = enqueue({ type: 'publish', payload: { scheduledPostId: post.id } });
    const stub = stubAdapter();

    await processJob(job, { store, adapter: stub.adapter });

    expect(getJob(job.id)?.status).toBe('done');
    expect(getPost(post.id)?.state).toBe('published');
    expect(getPost(post.id)?.remoteId).toBeTruthy();
    expect(stub.calls()).toBe(1);
  });

  it('does NOT repost when publish_log already has the job id (crash recovery)', async () => {
    const accountId = await connectedAccount('proc2');
    const post = createPost({ accountId, platform: 'linkedin', text: 'hi', schedulingMode: 'local' });
    const job = enqueue({ type: 'publish', payload: { scheduledPostId: post.id } });
    // Simulate a prior attempt that published successfully but crashed before recording done.
    recordPublish({
      idempotencyKey: job.id,
      accountId,
      platform: 'linkedin',
      remoteId: 'urn:li:share:prior',
      url: null,
    });
    const stub = stubAdapter();

    await processJob(job, { store, adapter: stub.adapter });

    expect(stub.calls()).toBe(0); // deduped — adapter never called
    expect(getPost(post.id)?.state).toBe('published');
    expect(getPost(post.id)?.remoteId).toBe('urn:li:share:prior');
    expect(getJob(job.id)?.status).toBe('done');
  });

  it('requeues on failure when attempts remain', async () => {
    const accountId = await connectedAccount('proc3');
    const post = createPost({ accountId, platform: 'linkedin', text: 'hi', schedulingMode: 'local' });
    const job = enqueue({ type: 'publish', payload: { scheduledPostId: post.id }, maxAttempts: 2 });
    const stub = stubAdapter({ fail: true });

    await processJob(job, { store, adapter: stub.adapter });

    expect(getJob(job.id)?.status).toBe('queued');
    expect(getPost(post.id)?.state).toBe('queued');
  });

  it('marks the post failed when the job dies', async () => {
    const accountId = await connectedAccount('proc4');
    const post = createPost({ accountId, platform: 'linkedin', text: 'hi', schedulingMode: 'local' });
    const job = enqueue({ type: 'publish', payload: { scheduledPostId: post.id }, maxAttempts: 1 });
    const stub = stubAdapter({ fail: true });

    await processJob(job, { store, adapter: stub.adapter });

    expect(getJob(job.id)?.status).toBe('dead');
    expect(getPost(post.id)?.state).toBe('failed');
  });
});

describe('Daemon loop', () => {
  it('autonomously publishes a post when it becomes due', async () => {
    const accountId = await connectedAccount('loop1');
    const stub = stubAdapter();
    const daemon = new Daemon({
      store,
      pollIntervalMs: 25,
      adapter: stub.adapter,
      refreshCron: '0 0 1 1 *', // effectively never during the test
    });
    daemon.start();
    try {
      const res = schedulePost({
        accountId,
        text: 'auto-published by the daemon',
        scheduledAt: new Date(Date.now() + 120),
      });
      await waitUntil(() => getPost(res.post.id)?.state === 'published', 3000);
      expect(getPost(res.post.id)?.state).toBe('published');
      expect(stub.calls()).toBe(1);
    } finally {
      await daemon.stop();
    }
  });
});
