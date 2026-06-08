import { graphPost } from '../meta/graph.js';
import type { PublishResult } from '../types.js';

/** Threads has its own Graph host + versioned base. */
export const THREADS_GRAPH_ROOT = 'https://graph.threads.net';
export const THREADS_BASE = `${THREADS_GRAPH_ROOT}/v1.0`;

export interface ThreadsPublishOptions {
  userId: string;
  accessToken: string;
  text?: string;
  imageUrl?: string;
  /** When set, this thread is a reply to that thread id. */
  replyToId?: string;
  baseUrl?: string;
}

/** Publish a thread via the container -> publish two-step (text or single image). */
export async function publishThread(opts: ThreadsPublishOptions): Promise<PublishResult> {
  const base = opts.baseUrl ?? THREADS_BASE;

  const containerParams: Record<string, string> = { access_token: opts.accessToken };
  if (opts.imageUrl) {
    containerParams.media_type = 'IMAGE';
    containerParams.image_url = opts.imageUrl;
    if (opts.text) containerParams.text = opts.text;
  } else {
    containerParams.media_type = 'TEXT';
    containerParams.text = opts.text ?? '';
  }
  if (opts.replyToId) containerParams.reply_to_id = opts.replyToId;

  const container = await graphPost<{ id: string }>(`/${opts.userId}/threads`, containerParams, base);
  const published = await graphPost<{ id: string }>(
    `/${opts.userId}/threads_publish`,
    { creation_id: container.id, access_token: opts.accessToken },
    base,
  );

  return { platform: 'threads', remoteId: published.id, state: 'published' };
}
