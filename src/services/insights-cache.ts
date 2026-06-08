import { getDb } from '../platform/db/open.js';

export function setInsightsCache(accountId: string, data: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO insights_cache (account_id, json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
    )
    .run(accountId, JSON.stringify(data), Date.now());
}

export function getInsightsCache(accountId: string): { data: unknown; updatedAt: number } | null {
  const row = getDb()
    .prepare('SELECT json, updated_at FROM insights_cache WHERE account_id = ?')
    .get(accountId) as unknown as { json: string; updated_at: number } | undefined;
  return row ? { data: JSON.parse(row.json), updatedAt: row.updated_at } : null;
}
