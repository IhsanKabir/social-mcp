import { describe, it, expect } from 'vitest';
import {
  enqueue,
  claimDueJob,
  getJob,
  markFailed,
  reclaimStaleJobs,
  cancelJob,
} from '../../src/queue/job-queue.js';

function drainAll(): void {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const j = claimDueJob('drain');
    if (!j) break;
  }
}

describe('job-queue', () => {
  it('enqueues and atomically claims a due job', () => {
    const job = enqueue({ type: 'publish', payload: { scheduledPostId: 'p1' } });
    expect(job.status).toBe('queued');
    const claimed = claimDueJob('d1');
    expect(claimed?.status).toBe('claimed');
    expect(claimed?.claimedBy).toBe('d1');
  });

  it('does not claim a job before its run_at', () => {
    drainAll();
    const future = enqueue({ type: 'publish', runAt: Date.now() + 60_000, payload: {} });
    expect(claimDueJob('d', Date.now())).toBeNull();
    const later = claimDueJob('d', Date.now() + 61_000);
    expect(later?.id).toBe(future.id);
  });

  it('requeues with backoff then dies after maxAttempts', () => {
    const job = enqueue({ type: 'publish', payload: {}, maxAttempts: 2 });
    const f1 = markFailed(job.id, 'boom');
    expect(f1.status).toBe('queued');
    expect(f1.attempts).toBe(1);
    expect(f1.runAt).toBeGreaterThan(Date.now()); // backed off into the future
    const f2 = markFailed(job.id, 'boom again');
    expect(f2.status).toBe('dead');
    expect(f2.attempts).toBe(2);
  });

  it('reclaims stale claimed jobs (crash recovery)', () => {
    drainAll();
    const job = enqueue({ type: 'publish', payload: {} });
    const claimed = claimDueJob('d');
    expect(claimed?.status).toBe('claimed');
    const reclaimed = reclaimStaleJobs(Date.now() + 10_000, 0);
    expect(reclaimed).toBeGreaterThanOrEqual(1);
    expect(getJob(job.id)?.status).toBe('queued');
    expect(getJob(job.id)?.claimedBy).toBeNull();
  });

  it('cancels a queued job once', () => {
    const job = enqueue({ type: 'publish', payload: {} });
    expect(cancelJob(job.id)).toBe(true);
    expect(getJob(job.id)?.status).toBe('canceled');
    expect(cancelJob(job.id)).toBe(false);
  });
});
