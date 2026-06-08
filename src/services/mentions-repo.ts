import { getDb } from '../platform/db/open.js';

export type MentionStatus = 'new' | 'drafted' | 'replied' | 'ignored';

export interface MentionRecord {
  id: string;
  accountId: string;
  postRemoteId: string | null;
  author: string | null;
  text: string | null;
  createdAt: number | null;
  fetchedAt: number;
  status: MentionStatus;
}

interface MentionRow {
  id: string;
  account_id: string;
  post_remote_id: string | null;
  author: string | null;
  text: string | null;
  created_at: number | null;
  fetched_at: number;
  status: string;
}

function mapRow(r: MentionRow): MentionRecord {
  return {
    id: r.id,
    accountId: r.account_id,
    postRemoteId: r.post_remote_id,
    author: r.author,
    text: r.text,
    createdAt: r.created_at,
    fetchedAt: r.fetched_at,
    status: r.status as MentionStatus,
  };
}

/** Insert a discovered comment if new. Returns true if it was newly recorded. */
export function upsertMention(m: {
  id: string;
  accountId: string;
  postRemoteId?: string | null;
  author?: string | null;
  text?: string | null;
  createdAt?: number | null;
}): boolean {
  const res = getDb()
    .prepare(
      `INSERT OR IGNORE INTO mentions
         (id, account_id, post_remote_id, author, text, created_at, fetched_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new')`,
    )
    .run(
      m.id,
      m.accountId,
      m.postRemoteId ?? null,
      m.author ?? null,
      m.text ?? null,
      m.createdAt ?? null,
      Date.now(),
    );
  return Number(res.changes) > 0;
}

export function listMentions(filter: { accountId?: string; status?: MentionStatus } = {}): MentionRecord[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filter.accountId) {
    clauses.push('account_id = ?');
    params.push(filter.accountId);
  }
  if (filter.status) {
    clauses.push('status = ?');
    params.push(filter.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = getDb()
    .prepare(`SELECT * FROM mentions ${where} ORDER BY fetched_at DESC`)
    .all(...params) as unknown as MentionRow[];
  return rows.map(mapRow);
}

export function setMentionStatus(id: string, status: MentionStatus): void {
  getDb().prepare('UPDATE mentions SET status = ? WHERE id = ?').run(status, id);
}
