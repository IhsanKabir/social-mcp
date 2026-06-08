import { getDb } from '../platform/db/open.js';
import type { PlatformId } from '../platform/ids.js';

/**
 * The idempotency ledger. Keyed by the publish job's id (== idempotencyKey). Before any
 * publish we check for an existing entry; after a successful publish we record one. This
 * prevents a retry (after a crash or transient error) from posting twice.
 */
export interface PublishLogEntry {
  idempotencyKey: string;
  accountId: string | null;
  platform: PlatformId;
  remoteId: string;
  url: string | null;
  createdAt: number;
}

interface LogRow {
  idempotency_key: string;
  account_id: string | null;
  platform: string;
  remote_id: string;
  remote_url: string | null;
  created_at: number;
}

export function findPublish(idempotencyKey: string): PublishLogEntry | null {
  const row = getDb()
    .prepare('SELECT * FROM publish_log WHERE idempotency_key = ?')
    .get(idempotencyKey) as unknown as LogRow | undefined;
  if (!row) return null;
  return {
    idempotencyKey: row.idempotency_key,
    accountId: row.account_id,
    platform: row.platform as PlatformId,
    remoteId: row.remote_id,
    url: row.remote_url,
    createdAt: row.created_at,
  };
}

export function recordPublish(entry: {
  idempotencyKey: string;
  accountId: string | null;
  platform: PlatformId;
  remoteId: string;
  url?: string | null;
}): void {
  // INSERT OR IGNORE: if two attempts race, the first write wins and the second is a no-op.
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO publish_log
         (idempotency_key, account_id, platform, remote_id, remote_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.idempotencyKey,
      entry.accountId,
      entry.platform,
      entry.remoteId,
      entry.url ?? null,
      Date.now(),
    );
}
