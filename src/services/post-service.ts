import type { TokenStore } from '../auth/token-store.js';
import type { SocialAdapter, PublishResult, MediaAsset } from '../adapters/types.js';
import type { Visibility } from '../adapters/capabilities.js';
import { capabilitiesFor } from '../adapters/capabilities.js';
import { getAdapter } from '../adapters/registry.js';
import { getAccount, buildAuthContext } from './account-registry.js';
import { findPublish, recordPublish } from '../queue/publish-log.js';
import { createPost, getPost } from '../queue/posts-repo.js';
import { enqueue } from '../queue/job-queue.js';
import type { ScheduledPost, SchedulingMode } from '../queue/types.js';

export interface PublishParams {
  accountId: string;
  text?: string;
  visibility?: Visibility;
  /** Forwarded to adapters that support native scheduling; ignored by 'emulated' platforms. */
  scheduledAt?: Date;
  /** Media assets (image URLs for the Meta family in v1). */
  media?: MediaAsset[];
  /** Idempotency key (== publish job id). Reusing it guarantees no double-post. */
  idempotencyKey: string;
  store: TokenStore;
  /** Adapter override (tests); defaults to the registry lookup for the account's platform. */
  adapter?: SocialAdapter;
}

export interface PublishOutcome {
  remoteId: string;
  url?: string;
  state: PublishResult['state'];
  /** True when the post was already published under this idempotency key (no API call made). */
  deduped: boolean;
}

/**
 * The single publish path shared by the CLI now and the scheduler daemon (Phase 3). It is
 * idempotent: a prior success under the same key short-circuits before any API call, and a
 * fresh success is recorded in publish_log so a later retry cannot repost.
 */
export async function publishNow(params: PublishParams): Promise<PublishOutcome> {
  const prior = findPublish(params.idempotencyKey);
  if (prior) {
    return { remoteId: prior.remoteId, url: prior.url ?? undefined, state: 'published', deduped: true };
  }

  const account = getAccount(params.accountId);
  if (!account) throw new Error(`Unknown account ${params.accountId}.`);

  const adapter = params.adapter ?? getAdapter(account.platform);
  const auth = await buildAuthContext(params.accountId, params.store);

  const result = await adapter.publish(
    {
      accountId: params.accountId,
      text: params.text,
      visibility: params.visibility,
      scheduledAt: params.scheduledAt,
      media: params.media,
      idempotencyKey: params.idempotencyKey,
    },
    auth,
  );

  // Only ledger states that represent a real remote object; drafts/processing are not logged.
  if (result.remoteId && (result.state === 'published' || result.state === 'scheduled')) {
    recordPublish({
      idempotencyKey: params.idempotencyKey,
      accountId: params.accountId,
      platform: account.platform,
      remoteId: result.remoteId,
      url: result.url ?? null,
    });
  }

  return { remoteId: result.remoteId, url: result.url, state: result.state, deduped: false };
}

export interface ScheduleParams {
  accountId: string;
  text?: string;
  visibility?: Visibility;
  /** Media refs: public image URLs (Meta) or local file paths (YouTube video). */
  mediaRefs?: string[];
  /** When to publish; null/undefined means as soon as the daemon picks it up. */
  scheduledAt?: Date | null;
}

export interface ScheduleResult {
  post: ScheduledPost;
  jobId: string;
  schedulingMode: SchedulingMode;
  /** When the publish job becomes due. */
  runAt: number;
}

/**
 * Create a scheduled post and enqueue its publish job. Scheduling mode is capability-driven:
 *  - native platforms (Facebook, YouTube): job runs now and sends the future time to the API.
 *  - emulated platforms (LinkedIn, IG, Threads): the daemon holds the job until the time.
 */
export function schedulePost(params: ScheduleParams): ScheduleResult {
  const account = getAccount(params.accountId);
  if (!account) throw new Error(`Unknown account ${params.accountId}.`);

  const caps = capabilitiesFor(account.platform);
  const mode: SchedulingMode = caps.publish.scheduling === 'native' ? 'native' : 'local';
  const wantAt = params.scheduledAt ? params.scheduledAt.getTime() : null;

  const post = createPost({
    accountId: params.accountId,
    platform: account.platform,
    text: params.text ?? null,
    visibility: params.visibility ?? null,
    scheduledAt: wantAt,
    schedulingMode: mode,
    mediaRefs: params.mediaRefs ?? [],
  });

  // Local scheduling waits until the target time; native publishes now with a future time.
  const runAt = mode === 'local' && wantAt ? wantAt : Date.now();
  const job = enqueue({ type: 'publish', payload: { scheduledPostId: post.id }, runAt });

  return { post, jobId: job.id, schedulingMode: mode, runAt };
}

/** Publish a queued post. Called by the daemon; idempotencyKey is the publish job's id. */
export async function publishScheduledPost(
  post: ScheduledPost,
  idempotencyKey: string,
  store: TokenStore,
  adapter?: SocialAdapter,
): Promise<PublishOutcome> {
  const reloaded = getPost(post.id) ?? post;
  const scheduledAt =
    reloaded.schedulingMode === 'native' && reloaded.scheduledAt
      ? new Date(reloaded.scheduledAt)
      : undefined;
  // A ref is a URL (Meta image) or a local file path (YouTube video).
  const media: MediaAsset[] = reloaded.mediaRefs.map((ref) =>
    /^https?:\/\//i.test(ref) ? { url: ref } : { path: ref },
  );
  return publishNow({
    accountId: reloaded.accountId,
    text: reloaded.text ?? undefined,
    visibility: reloaded.visibility ?? undefined,
    scheduledAt,
    media: media.length ? media : undefined,
    idempotencyKey,
    store,
    adapter,
  });
}
