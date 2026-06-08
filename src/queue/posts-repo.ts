import { randomUUID } from 'node:crypto';
import { getDb } from '../platform/db/open.js';
import type { PlatformId } from '../platform/ids.js';
import type { Visibility } from '../adapters/capabilities.js';
import type { ScheduledPost, SchedulingMode, PostState } from './types.js';

interface PostRow {
  id: string;
  account_id: string;
  platform: string;
  text: string | null;
  media_refs: string;
  visibility: string | null;
  scheduled_at: number | null;
  scheduling_mode: string;
  state: string;
  remote_id: string | null;
  remote_url: string | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

function mapRow(r: PostRow): ScheduledPost {
  return {
    id: r.id,
    accountId: r.account_id,
    platform: r.platform as PlatformId,
    text: r.text,
    mediaRefs: JSON.parse(r.media_refs) as string[],
    visibility: (r.visibility as Visibility | null) ?? null,
    scheduledAt: r.scheduled_at,
    schedulingMode: r.scheduling_mode as SchedulingMode,
    state: r.state as PostState,
    remoteId: r.remote_id,
    remoteUrl: r.remote_url,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface NewPost {
  accountId: string;
  platform: PlatformId;
  text?: string | null;
  mediaRefs?: string[];
  visibility?: Visibility | null;
  scheduledAt?: number | null;
  schedulingMode: SchedulingMode;
  state?: PostState;
}

export function createPost(input: NewPost): ScheduledPost {
  const now = Date.now();
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO scheduled_posts
         (id, account_id, platform, text, media_refs, visibility, scheduled_at, scheduling_mode, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.accountId,
      input.platform,
      input.text ?? null,
      JSON.stringify(input.mediaRefs ?? []),
      input.visibility ?? null,
      input.scheduledAt ?? null,
      input.schedulingMode,
      input.state ?? 'queued',
      now,
      now,
    );
  return getPost(id)!;
}

export function getPost(id: string): ScheduledPost | null {
  const row = getDb().prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(id) as unknown as
    | PostRow
    | undefined;
  return row ? mapRow(row) : null;
}

export function listPosts(filter: { state?: PostState; accountId?: string } = {}): ScheduledPost[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filter.state) {
    clauses.push('state = ?');
    params.push(filter.state);
  }
  if (filter.accountId) {
    clauses.push('account_id = ?');
    params.push(filter.accountId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = getDb()
    .prepare(`SELECT * FROM scheduled_posts ${where} ORDER BY COALESCE(scheduled_at, created_at) ASC`)
    .all(...params) as unknown as PostRow[];
  return rows.map(mapRow);
}

export function setPostState(id: string, state: PostState): void {
  getDb()
    .prepare('UPDATE scheduled_posts SET state = ?, updated_at = ? WHERE id = ?')
    .run(state, Date.now(), id);
}

export function markPostPublished(id: string, remoteId: string, url: string | null): void {
  getDb()
    .prepare(
      "UPDATE scheduled_posts SET state='published', remote_id=?, remote_url=?, updated_at=? WHERE id=?",
    )
    .run(remoteId, url, Date.now(), id);
}

export function markPostFailed(id: string, error: string): void {
  getDb()
    .prepare("UPDATE scheduled_posts SET state='failed', last_error=?, updated_at=? WHERE id=?")
    .run(error, Date.now(), id);
}

/** Cancel a post that hasn't published yet. Returns true if it was cancellable. */
export function cancelPost(id: string): boolean {
  const res = getDb()
    .prepare(
      "UPDATE scheduled_posts SET state='canceled', updated_at=? WHERE id=? AND state IN ('draft','queued')",
    )
    .run(Date.now(), id);
  return Number(res.changes) > 0;
}
