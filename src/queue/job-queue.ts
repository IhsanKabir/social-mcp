import { randomUUID } from 'node:crypto';
import { getDb } from '../platform/db/open.js';
import type { Job, JobType, JobStatus } from './types.js';

/** A claimed/running job older than this (by claimed_at) is considered stuck and reclaimed. */
export const LEASE_TTL_MS = 10 * 60 * 1000;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 10 * 60 * 1000;

interface JobRow {
  id: string;
  type: string;
  status: string;
  run_at: number;
  claimed_by: string | null;
  claimed_at: number | null;
  attempts: number;
  max_attempts: number;
  next_backoff_ms: number | null;
  last_error: string | null;
  payload: string;
  created_at: number;
  updated_at: number;
}

function mapRow(r: JobRow): Job {
  return {
    id: r.id,
    type: r.type as JobType,
    status: r.status as JobStatus,
    runAt: r.run_at,
    claimedBy: r.claimed_by,
    claimedAt: r.claimed_at,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    nextBackoffMs: r.next_backoff_ms,
    lastError: r.last_error,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface EnqueueOptions {
  type: JobType;
  payload?: Record<string, unknown>;
  runAt?: number;
  maxAttempts?: number;
}

export function enqueue(opts: EnqueueOptions): Job {
  const now = Date.now();
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO jobs (id, type, status, run_at, attempts, max_attempts, payload, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, 0, ?, ?, ?, ?)`,
    )
    .run(id, opts.type, opts.runAt ?? now, opts.maxAttempts ?? 5, JSON.stringify(opts.payload ?? {}), now, now);
  return getJob(id)!;
}

export function getJob(id: string): Job | null {
  const row = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as unknown as
    | JobRow
    | undefined;
  return row ? mapRow(row) : null;
}

/**
 * Atomically claim the next due job. Uses a guarded UPDATE (WHERE status='queued') so two
 * workers (even in separate processes over WAL) can never claim the same row: the loser's
 * UPDATE matches 0 rows and we try the next candidate.
 */
export function claimDueJob(daemonId: string, now: number = Date.now()): Job | null {
  const db = getDb();
  const candidate = db
    .prepare("SELECT id FROM jobs WHERE status='queued' AND run_at <= ? ORDER BY run_at ASC LIMIT 1")
    .get(now) as unknown as { id: string } | undefined;
  if (!candidate) return null;

  const res = db
    .prepare(
      "UPDATE jobs SET status='claimed', claimed_by=?, claimed_at=?, updated_at=? WHERE id=? AND status='queued'",
    )
    .run(daemonId, now, now, candidate.id);

  if (Number(res.changes) === 0) {
    // Lost the race for this row; try the next due job.
    return claimDueJob(daemonId, now);
  }
  return getJob(candidate.id);
}

export function markRunning(id: string): void {
  getDb()
    .prepare("UPDATE jobs SET status='running', updated_at=? WHERE id=?")
    .run(Date.now(), id);
}

export function markDone(id: string): void {
  getDb().prepare("UPDATE jobs SET status='done', updated_at=? WHERE id=?").run(Date.now(), id);
}

/**
 * Record a failure. Requeues with exponential backoff until maxAttempts is reached, after
 * which the job is marked 'dead'. Returns the updated job.
 */
export function markFailed(id: string, error: string): Job {
  const job = getJob(id);
  if (!job) throw new Error(`markFailed: no job ${id}`);
  const attempts = job.attempts + 1;
  const now = Date.now();
  const db = getDb();

  if (attempts >= job.maxAttempts) {
    db.prepare("UPDATE jobs SET status='dead', attempts=?, last_error=?, updated_at=? WHERE id=?").run(
      attempts,
      error,
      now,
      id,
    );
  } else {
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
    db.prepare(
      `UPDATE jobs SET status='queued', attempts=?, last_error=?, next_backoff_ms=?, run_at=?,
         claimed_by=NULL, claimed_at=NULL, updated_at=? WHERE id=?`,
    ).run(attempts, error, backoff, now + backoff, now, id);
  }
  return getJob(id)!;
}

/** Cancel a job that hasn't completed. Returns true if it was cancellable. */
export function cancelJob(id: string): boolean {
  const res = getDb()
    .prepare(
      "UPDATE jobs SET status='canceled', updated_at=? WHERE id=? AND status IN ('queued','claimed','running')",
    )
    .run(Date.now(), id);
  return Number(res.changes) > 0;
}

/** Reclaim jobs stuck in claimed/running past the lease TTL (crash recovery). Returns count. */
export function reclaimStaleJobs(now: number = Date.now(), ttlMs: number = LEASE_TTL_MS): number {
  const res = getDb()
    .prepare(
      `UPDATE jobs SET status='queued', claimed_by=NULL, claimed_at=NULL, updated_at=?
       WHERE status IN ('claimed','running') AND claimed_at IS NOT NULL AND claimed_at < ?`,
    )
    .run(now, now - ttlMs);
  return Number(res.changes);
}

export function listJobs(filter: { status?: JobStatus } = {}): Job[] {
  const rows = filter.status
    ? (getDb()
        .prepare('SELECT * FROM jobs WHERE status = ? ORDER BY run_at ASC')
        .all(filter.status) as unknown as JobRow[])
    : (getDb().prepare('SELECT * FROM jobs ORDER BY run_at ASC').all() as unknown as JobRow[]);
  return rows.map(mapRow);
}
