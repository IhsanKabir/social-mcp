import { describe, it, expect } from 'vitest';
import {
  upsertAccount,
  listAccounts,
  getAccount,
  setAccountStatus,
  deleteAccount,
} from '../../src/services/account-registry.js';

describe('account-registry', () => {
  it('upserts, reads, and lists accounts', () => {
    const a = upsertAccount({ platform: 'linkedin', label: 'me' });
    expect(a.id).toBeTruthy();
    expect(a.status).toBe('active');
    expect(getAccount(a.id)?.label).toBe('me');
    expect(listAccounts().some((x) => x.id === a.id)).toBe(true);
  });

  it('updates label on conflicting id', () => {
    const a = upsertAccount({ platform: 'linkedin', label: 'first' });
    const b = upsertAccount({ id: a.id, platform: 'linkedin', label: 'second' });
    expect(b.id).toBe(a.id);
    expect(getAccount(a.id)?.label).toBe('second');
  });

  it('changes status and deletes', () => {
    const a = upsertAccount({ platform: 'facebook', label: 'page1' });
    setAccountStatus(a.id, 'needs_reauth');
    expect(getAccount(a.id)?.status).toBe('needs_reauth');
    deleteAccount(a.id);
    expect(getAccount(a.id)).toBeNull();
  });
});
