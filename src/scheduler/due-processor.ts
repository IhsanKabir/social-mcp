import type { TokenStore } from '../auth/token-store.js';
import type { SocialAdapter } from '../adapters/types.js';
import type { Job } from '../queue/types.js';
import { markDone, markFailed } from '../queue/job-queue.js';
import {
  getPost,
  setPostState,
  markPostPublished,
  markPostFailed,
} from '../queue/posts-repo.js';
import { publishScheduledPost } from '../services/post-service.js';
import { logger } from '../platform/logger.js';

export interface ProcessDeps {
  store: TokenStore;
  /** Adapter override (tests). Production resolves via the registry inside PostService. */
  adapter?: SocialAdapter;
}

/** Dispatch a claimed job to its handler. */
export async function processJob(job: Job, deps: ProcessDeps): Promise<void> {
  switch (job.type) {
    case 'publish':
      await processPublish(job, deps);
      return;
    default:
      logger.warn({ jobId: job.id, type: job.type }, 'unknown job type; marking done');
      markDone(job.id);
  }
}

async function processPublish(job: Job, deps: ProcessDeps): Promise<void> {
  const postId = (job.payload as { scheduledPostId?: string }).scheduledPostId;
  if (!postId) {
    markFailed(job.id, 'publish job missing scheduledPostId');
    return;
  }

  const post = getPost(postId);
  if (!post) {
    // Post was deleted; nothing to do.
    markDone(job.id);
    return;
  }
  if (post.state === 'canceled' || post.state === 'published') {
    markDone(job.id);
    return;
  }

  setPostState(post.id, 'publishing');
  try {
    const outcome = await publishScheduledPost(post, job.id, deps.store, deps.adapter);
    markPostPublished(post.id, outcome.remoteId, outcome.url ?? null);
    markDone(job.id);
    logger.info(
      { postId: post.id, remoteId: outcome.remoteId, deduped: outcome.deduped },
      'post published',
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const updated = markFailed(job.id, msg);
    if (updated.status === 'dead') {
      markPostFailed(post.id, msg);
    } else {
      setPostState(post.id, 'queued'); // will retry after backoff
    }
    logger.error(
      { postId: post.id, jobId: job.id, status: updated.status, attempts: updated.attempts, err: msg },
      'publish failed',
    );
  }
}
