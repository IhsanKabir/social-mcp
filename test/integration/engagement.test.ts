import { describe, it, expect } from 'vitest';
import { getComments, postReply } from '../../src/services/engagement-service.js';
import {
  getAccountInsights,
  generateReport,
} from '../../src/services/analytics-service.js';
import { runAnalyticsCache, runEngagementPoll } from '../../src/scheduler/cron-runner.js';
import { getInsightsCache } from '../../src/services/insights-cache.js';
import { listMentions } from '../../src/services/mentions-repo.js';
import { upsertAccount } from '../../src/services/account-registry.js';
import { registerAdapter } from '../../src/adapters/registry.js';
import { createPost, markPostPublished } from '../../src/queue/posts-repo.js';
import { EncryptedTokenStore } from '../../src/auth/stores/encrypted.js';
import { capabilitiesFor } from '../../src/adapters/capabilities.js';
import { CapabilityError } from '../../src/adapters/capability-error.js';
import type { PlatformId } from '../../src/platform/ids.js';
import type { SocialAdapter, Comment } from '../../src/adapters/types.js';

const store = new EncryptedTokenStore();

function stub(
  platform: PlatformId,
  opts: { comments?: Comment[]; metrics?: Record<string, number>; replyId?: string } = {},
): SocialAdapter {
  return {
    platform,
    capabilities: () => capabilitiesFor(platform),
    async publish() {
      return { platform, remoteId: 'x', state: 'published' };
    },
    async getComments() {
      return opts.comments ?? [];
    },
    async getMentions() {
      return [];
    },
    async reply() {
      return { id: opts.replyId ?? 'r1' };
    },
    async getInsights() {
      return { metrics: opts.metrics ?? {}, pulledAt: new Date() };
    },
    async refreshAuth() {
      return null;
    },
  };
}

async function connect(platform: PlatformId, label: string): Promise<string> {
  const acct = upsertAccount({ platform, label });
  await store.set({
    accountId: acct.id,
    platform,
    accessToken: 't',
    scopes: [],
    meta: { pageId: 'P', igUserId: 'IG', channelId: 'C', authorUrn: 'u', threadsUserId: 'T' },
    obtainedAt: Date.now(),
  });
  return acct.id;
}

describe('engagement-service', () => {
  it('reads comments on a capable platform', async () => {
    const id = await connect('facebook', 'fb');
    const comments = await getComments(id, 'POST', {
      store,
      adapter: stub('facebook', {
        comments: [{ id: 'c1', author: 'Bo', text: 'hi', createdAt: new Date(), canReply: true }],
      }),
    });
    expect(comments[0]!.author).toBe('Bo');
  });

  it('rejects comments on an incapable platform (LinkedIn)', async () => {
    const id = await connect('linkedin', 'li');
    await expect(getComments(id, 'POST', { store, adapter: stub('linkedin') })).rejects.toBeInstanceOf(
      CapabilityError,
    );
  });

  it('posts a reply on a capable platform', async () => {
    const id = await connect('facebook', 'fb2');
    const res = await postReply(id, 'c1', 'thanks', { store, adapter: stub('facebook', { replyId: 'rep_9' }) });
    expect(res.id).toBe('rep_9');
  });

  it('rejects replies on LinkedIn', async () => {
    const id = await connect('linkedin', 'li2');
    await expect(postReply(id, 'c1', 'x', { store, adapter: stub('linkedin') })).rejects.toBeInstanceOf(
      CapabilityError,
    );
  });
});

describe('analytics-service', () => {
  it('returns account insights on a capable platform', async () => {
    const id = await connect('facebook', 'fb3');
    const insights = await getAccountInsights(id, {
      store,
      adapter: stub('facebook', { metrics: { page_impressions: 99 } }),
    });
    expect(insights.metrics.page_impressions).toBe(99);
  });

  it('rejects insights on LinkedIn', async () => {
    const id = await connect('linkedin', 'li3');
    await expect(getAccountInsights(id, { store, adapter: stub('linkedin') })).rejects.toBeInstanceOf(
      CapabilityError,
    );
  });

  it('generateReport mixes metrics and capability notes', async () => {
    registerAdapter('facebook', () => stub('facebook', { metrics: { page_impressions: 5 } }));
    registerAdapter('linkedin', () => stub('linkedin'));
    await connect('facebook', 'rep-fb');
    await connect('linkedin', 'rep-li');

    const report = await generateReport({ store });
    const fb = report.find((r) => r.platform === 'facebook' && r.label === 'rep-fb')!;
    const li = report.find((r) => r.platform === 'linkedin' && r.label === 'rep-li')!;
    expect(fb.metrics?.page_impressions).toBe(5);
    expect(li.note).toMatch(/account insights/i);
  });
});

describe('daemon cron functions', () => {
  it('runAnalyticsCache caches account insights', async () => {
    const id = await connect('facebook', 'cache-fb');
    await runAnalyticsCache(store, { adapter: stub('facebook', { metrics: { page_fans: 12 } }) });
    const cached = getInsightsCache(id) as { data: { metrics: Record<string, number> } } | null;
    expect(cached?.data.metrics.page_fans).toBe(12);
  });

  it('runEngagementPoll records new comments as mentions', async () => {
    const id = await connect('facebook', 'poll-fb');
    const post = createPost({ accountId: id, platform: 'facebook', text: 'hi', schedulingMode: 'native' });
    markPostPublished(post.id, 'REMOTE1', null);

    const discovered = await runEngagementPoll(store, {
      adapter: stub('facebook', {
        comments: [{ id: 'cm1', author: 'X', text: 'nice', createdAt: new Date(), canReply: true }],
      }),
    });
    expect(discovered).toBeGreaterThanOrEqual(1);
    const mentions = listMentions({ accountId: id });
    expect(mentions.some((m) => m.id === 'cm1')).toBe(true);
  });
});
