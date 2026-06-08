import { describe, it, expect } from 'vitest';
import { upsertAccount } from '../../src/services/account-registry.js';
import {
  upsertMention,
  listMentions,
  setMentionStatus,
} from '../../src/services/mentions-repo.js';
import { schedulePost } from '../../src/services/post-service.js';

describe('mentions-repo', () => {
  it('dedupes, filters by account/status, and updates status', () => {
    const acct = upsertAccount({ platform: 'facebook', label: 'm' });
    expect(upsertMention({ id: 'm1', accountId: acct.id, text: 'hi' })).toBe(true);
    expect(upsertMention({ id: 'm1', accountId: acct.id, text: 'hi' })).toBe(false); // dedup

    expect(listMentions({ accountId: acct.id })).toHaveLength(1);
    expect(listMentions({ accountId: acct.id, status: 'new' })).toHaveLength(1);
    expect(listMentions({ status: 'replied' }).some((m) => m.id === 'm1')).toBe(false);

    setMentionStatus('m1', 'replied');
    expect(listMentions({ accountId: acct.id, status: 'replied' })).toHaveLength(1);
  });
});

describe('schedulePost scheduling mode', () => {
  it('uses native mode for Facebook (job runs now)', () => {
    const acct = upsertAccount({ platform: 'facebook', label: 'sch' });
    const res = schedulePost({
      accountId: acct.id,
      text: 'later',
      scheduledAt: new Date(Date.now() + 3_600_000),
    });
    expect(res.schedulingMode).toBe('native');
    expect(res.runAt).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('uses local mode for LinkedIn (job runs at the scheduled time)', () => {
    const acct = upsertAccount({ platform: 'linkedin', label: 'sch2' });
    const when = Date.now() + 3_600_000;
    const res = schedulePost({ accountId: acct.id, text: 'later', scheduledAt: new Date(when) });
    expect(res.schedulingMode).toBe('local');
    expect(res.runAt).toBe(when);
  });
});
