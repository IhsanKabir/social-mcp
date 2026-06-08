import { randomUUID } from 'node:crypto';
import { getDb } from '../platform/db/open.js';
import type { PlatformId } from '../platform/ids.js';
import type { TokenStore } from '../auth/token-store.js';
import type { AuthContext, SocialAdapter } from '../adapters/types.js';
import { getAdapter } from '../adapters/registry.js';

export type AccountStatus = 'active' | 'needs_reauth' | 'disabled';

export interface Account {
  id: string;
  platform: PlatformId;
  label: string;
  remoteId?: string | null;
  status: AccountStatus;
  createdAt: number;
  updatedAt: number;
}

interface AccountRow {
  id: string;
  platform: string;
  label: string;
  remote_id: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

function mapRow(r: AccountRow): Account {
  return {
    id: r.id,
    platform: r.platform as PlatformId,
    label: r.label,
    remoteId: r.remote_id,
    status: r.status as AccountStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listAccounts(): Account[] {
  const rows = getDb()
    .prepare('SELECT * FROM accounts ORDER BY platform, label')
    .all() as unknown as AccountRow[];
  return rows.map(mapRow);
}

export function getAccount(id: string): Account | null {
  const row = getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as unknown as
    | AccountRow
    | undefined;
  return row ? mapRow(row) : null;
}

export interface NewAccount {
  platform: PlatformId;
  label: string;
  remoteId?: string | null;
  id?: string;
}

/** Insert a new account (or update label/remoteId if the id already exists). */
export function upsertAccount(input: NewAccount): Account {
  const now = Date.now();
  const id = input.id ?? randomUUID();
  getDb()
    .prepare(
      `INSERT INTO accounts (id, platform, label, remote_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         label = excluded.label,
         remote_id = excluded.remote_id,
         updated_at = excluded.updated_at`,
    )
    .run(id, input.platform, input.label, input.remoteId ?? null, now, now);
  const account = getAccount(id);
  if (!account) throw new Error(`Failed to upsert account ${id}`);
  return account;
}

export function setAccountStatus(id: string, status: AccountStatus): void {
  getDb()
    .prepare('UPDATE accounts SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id);
}

export function deleteAccount(id: string): void {
  getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id);
}

/** Resolve an account plus its adapter (or a test override). Throws on unknown account. */
export function resolveAdapter(
  accountId: string,
  override?: SocialAdapter,
): { account: Account; adapter: SocialAdapter } {
  const account = getAccount(accountId);
  if (!account) throw new Error(`Unknown account ${accountId}.`);
  return { account, adapter: override ?? getAdapter(account.platform) };
}

/**
 * Build the per-call AuthContext for an account from the token store. Tokens are never held
 * on adapters — this is constructed fresh for each operation. The onTokenRotated callback
 * persists a token an adapter rotates mid-flight.
 */
export async function buildAuthContext(accountId: string, store: TokenStore): Promise<AuthContext> {
  const token = await store.get(accountId);
  if (!token) {
    throw new Error(`No stored token for account ${accountId}. Run \`social-mcp auth\` for it.`);
  }
  return {
    accessToken: token.accessToken,
    meta: token.meta,
    onTokenRotated: async (rotated) => {
      await store.set(rotated);
    },
  };
}
