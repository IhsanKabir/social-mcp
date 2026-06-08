import { describe, it, expect } from 'vitest';
import { EncryptedTokenStore } from '../../src/auth/stores/encrypted.js';
import { upsertAccount } from '../../src/services/account-registry.js';
import { getDb } from '../../src/platform/db/open.js';

const store = new EncryptedTokenStore();
const SECRET = 'super-secret-access-token-DO-NOT-LEAK';

describe('EncryptedTokenStore', () => {
  it('round-trips a token and never stores plaintext', async () => {
    const acct = upsertAccount({ platform: 'linkedin', label: 'me' });
    await store.set({
      accountId: acct.id,
      platform: 'linkedin',
      accessToken: SECRET,
      refreshToken: null,
      expiresAt: Date.now() + 1_000_000,
      scopes: ['openid', 'w_member_social'],
      meta: { authorUrn: 'urn:li:person:abc' },
      obtainedAt: Date.now(),
    });

    const got = await store.get(acct.id);
    expect(got?.accessToken).toBe(SECRET);
    expect(got?.meta?.authorUrn).toBe('urn:li:person:abc');

    // The stored ciphertext must not contain the plaintext secret.
    const row = getDb()
      .prepare('SELECT ciphertext FROM tokens WHERE account_id = ?')
      .get(acct.id) as unknown as { ciphertext: string };
    expect(row.ciphertext).not.toContain('super-secret');
    expect(row.ciphertext).not.toContain(SECRET);
  });

  it('list() returns summaries with no secrets', async () => {
    const list = await store.list();
    expect(list.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toContain(SECRET);
    // summary carries scopes + expiry but not the access token
    expect(list[0]).not.toHaveProperty('accessToken');
  });

  it('finds expiring tokens and deletes', async () => {
    const acct = upsertAccount({ platform: 'linkedin', label: 'expiring' });
    await store.set({
      accountId: acct.id,
      platform: 'linkedin',
      accessToken: 'tok',
      scopes: [],
      expiresAt: Date.now() - 1,
      obtainedAt: Date.now(),
    });
    const expiring = await store.expiringBefore(Date.now());
    expect(expiring.some((t) => t.accountId === acct.id)).toBe(true);

    await store.delete(acct.id);
    expect(await store.get(acct.id)).toBeNull();
  });
});
