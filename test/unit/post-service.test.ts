import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { publishNow } from '../../src/services/post-service.js';
import { upsertAccount } from '../../src/services/account-registry.js';
import { EncryptedTokenStore } from '../../src/auth/stores/encrypted.js';
import { capabilitiesFor } from '../../src/adapters/capabilities.js';
import type {
  SocialAdapter,
  PublishRequest,
  PublishResult,
  AuthContext,
} from '../../src/adapters/types.js';

function countingAdapter() {
  let calls = 0;
  const adapter: SocialAdapter = {
    platform: 'linkedin',
    capabilities: () => capabilitiesFor('linkedin'),
    async publish(_req: PublishRequest, _auth: AuthContext): Promise<PublishResult> {
      calls += 1;
      return { platform: 'linkedin', remoteId: 'urn:li:share:remote', url: 'https://x', state: 'published' };
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

describe('publishNow', () => {
  const store = new EncryptedTokenStore();

  it('publishes once and dedupes a repeat with the same idempotency key', async () => {
    const acct = upsertAccount({ platform: 'linkedin', label: 'idem' });
    await store.set({
      accountId: acct.id,
      platform: 'linkedin',
      accessToken: 't',
      scopes: [],
      meta: { authorUrn: 'urn:li:person:x' },
      obtainedAt: Date.now(),
    });

    const fake = countingAdapter();
    const key = randomUUID();

    const first = await publishNow({
      accountId: acct.id,
      text: 'hi',
      idempotencyKey: key,
      store,
      adapter: fake.adapter,
    });
    const second = await publishNow({
      accountId: acct.id,
      text: 'hi',
      idempotencyKey: key,
      store,
      adapter: fake.adapter,
    });

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(first.remoteId).toBe('urn:li:share:remote');
    expect(second.remoteId).toBe('urn:li:share:remote');
    expect(fake.calls()).toBe(1); // the second call never hit the adapter
  });

  it('throws for an unknown account', async () => {
    await expect(
      publishNow({ accountId: 'does-not-exist', text: 'x', idempotencyKey: randomUUID(), store }),
    ).rejects.toThrow(/Unknown account/);
  });
});
