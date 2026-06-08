import type { PlatformId } from '../platform/ids.js';
import type { Visibility } from '../adapters/capabilities.js';

export type JobType =
  | 'publish'
  | 'refresh_token'
  | 'pull_analytics'
  | 'poll_mentions'
  | 'custom_cron';

export type JobStatus =
  | 'queued'
  | 'claimed'
  | 'running'
  | 'done'
  | 'failed'
  | 'canceled'
  | 'dead';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  /** epoch ms; the daemon claims rows where status='queued' AND run_at <= now. */
  runAt: number;
  claimedBy?: string | null;
  claimedAt?: number | null;
  attempts: number;
  maxAttempts: number;
  nextBackoffMs?: number | null;
  lastError?: string | null;
  /** JSON payload; for publish jobs this is { scheduledPostId }. */
  payload: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface PublishJobPayload {
  scheduledPostId: string;
}

export type SchedulingMode = 'native' | 'local';

export type PostState =
  | 'draft'
  | 'queued'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'canceled';

export interface ScheduledPost {
  id: string;
  accountId: string;
  platform: PlatformId;
  text?: string | null;
  mediaRefs: string[];
  visibility?: Visibility | null;
  /** epoch ms; null => publish ASAP. */
  scheduledAt?: number | null;
  schedulingMode: SchedulingMode;
  state: PostState;
  remoteId?: string | null;
  remoteUrl?: string | null;
  lastError?: string | null;
  createdAt: number;
  updatedAt: number;
}
