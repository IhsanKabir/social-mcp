import { getDb } from '../../platform/db/open.js';

/**
 * Pre-flight quota guard. videos.insert costs ~1600 of the default 10,000 units/day, i.e.
 * roughly 6 uploads/day, so we refuse over-budget uploads BEFORE burning units on a 403.
 * Counts are tracked per UTC day in the kv table.
 */
export const DEFAULT_MAX_UPLOADS_PER_DAY = 6;

function todayKey(): string {
  return `yt_uploads:${new Date().toISOString().slice(0, 10)}`;
}

export function uploadsToday(): number {
  const row = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(todayKey()) as unknown as
    | { value: string }
    | undefined;
  return row ? Number(row.value) : 0;
}

export function assertUploadQuota(maxPerDay: number = DEFAULT_MAX_UPLOADS_PER_DAY): void {
  const used = uploadsToday();
  if (used >= maxPerDay) {
    throw new Error(
      `YouTube daily upload quota reached (${used}/${maxPerDay}). videos.insert is quota-heavy (~1600 of 10,000 units each). Try again tomorrow or request a quota increase from Google.`,
    );
  }
}

export function recordUpload(): void {
  const key = todayKey();
  const next = uploadsToday() + 1;
  getDb()
    .prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(next));
}
