import { graphGet, graphPost } from '../meta/graph.js';
import { sleep } from '../media-util.js';
import type { PublishResult } from '../types.js';

/** Threads has its own Graph host + versioned base. */
export const THREADS_GRAPH_ROOT = 'https://graph.threads.net';
export const THREADS_BASE = `${THREADS_GRAPH_ROOT}/v1.0`;

interface PollOptions {
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}
const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_POLL_TIMEOUT = 120_000;

/** Poll a Threads media container until it finishes processing (needed for video). */
export async function pollThreadStatus(
  containerId: string,
  accessToken: string,
  base: string,
  opts: PollOptions = {},
): Promise<void> {
  const interval = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
  const timeout = opts.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT;
  const start = Date.now();
  for (;;) {
    const res = await graphGet<{ status?: string }>(
      `/${containerId}`,
      { access_token: accessToken, fields: 'status' },
      base,
    );
    const status = res.status;
    if (status === 'FINISHED' || status === 'PUBLISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Threads container ${status}`);
    if (Date.now() - start > timeout) throw new Error('Threads container processing timed out');
    await sleep(interval);
  }
}

export interface ThreadsPublishOptions extends PollOptions {
  userId: string;
  accessToken: string;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  /** When set, this thread is a reply to that thread id. */
  replyToId?: string;
  baseUrl?: string;
}

/** Publish a single thread (text, image, or video) via container -> publish. */
export async function publishThread(opts: ThreadsPublishOptions): Promise<PublishResult> {
  const base = opts.baseUrl ?? THREADS_BASE;

  const params: Record<string, string> = { access_token: opts.accessToken };
  if (opts.videoUrl) {
    params.media_type = 'VIDEO';
    params.video_url = opts.videoUrl;
    if (opts.text) params.text = opts.text;
  } else if (opts.imageUrl) {
    params.media_type = 'IMAGE';
    params.image_url = opts.imageUrl;
    if (opts.text) params.text = opts.text;
  } else {
    params.media_type = 'TEXT';
    params.text = opts.text ?? '';
  }
  if (opts.replyToId) params.reply_to_id = opts.replyToId;

  const container = await graphPost<{ id: string }>(`/${opts.userId}/threads`, params, base);
  if (opts.videoUrl) await pollThreadStatus(container.id, opts.accessToken, base, opts);

  const published = await graphPost<{ id: string }>(
    `/${opts.userId}/threads_publish`,
    { creation_id: container.id, access_token: opts.accessToken },
    base,
  );
  return { platform: 'threads', remoteId: published.id, state: 'published' };
}

export interface ThreadsCarouselOptions extends PollOptions {
  userId: string;
  accessToken: string;
  items: { url: string; isVideo: boolean }[];
  text?: string;
  baseUrl?: string;
}

/** Publish a Threads carousel: child containers -> parent CAROUSEL -> publish. */
export async function publishThreadCarousel(opts: ThreadsCarouselOptions): Promise<PublishResult> {
  const base = opts.baseUrl ?? THREADS_BASE;
  const childIds: string[] = [];
  for (const item of opts.items) {
    const p: Record<string, string> = { is_carousel_item: 'true', access_token: opts.accessToken };
    if (item.isVideo) {
      p.media_type = 'VIDEO';
      p.video_url = item.url;
    } else {
      p.media_type = 'IMAGE';
      p.image_url = item.url;
    }
    const child = await graphPost<{ id: string }>(`/${opts.userId}/threads`, p, base);
    if (item.isVideo) await pollThreadStatus(child.id, opts.accessToken, base, opts);
    childIds.push(child.id);
  }
  const parentParams: Record<string, string> = {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    access_token: opts.accessToken,
  };
  if (opts.text) parentParams.text = opts.text;
  const parent = await graphPost<{ id: string }>(`/${opts.userId}/threads`, parentParams, base);
  const published = await graphPost<{ id: string }>(
    `/${opts.userId}/threads_publish`,
    { creation_id: parent.id, access_token: opts.accessToken },
    base,
  );
  return { platform: 'threads', remoteId: published.id, state: 'published' };
}
