import { graphGet, graphPost, GRAPH_BASE } from '../meta/graph.js';
import { sleep } from '../media-util.js';
import type { PublishResult } from '../types.js';

interface PollOptions {
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_POLL_TIMEOUT = 120_000;

/** Poll a media container until it finishes processing (required for video/Reels). */
export async function pollContainerStatus(
  containerId: string,
  accessToken: string,
  base: string,
  opts: PollOptions = {},
): Promise<void> {
  const interval = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
  const timeout = opts.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT;
  const start = Date.now();
  for (;;) {
    const res = await graphGet<{ status_code?: string }>(
      `/${containerId}`,
      { access_token: accessToken, fields: 'status_code' },
      base,
    );
    const status = res.status_code;
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`Instagram media container ${status}`);
    }
    if (Date.now() - start > timeout) throw new Error('Instagram container processing timed out');
    await sleep(interval);
  }
}

async function publishContainer(
  igUserId: string,
  creationId: string,
  accessToken: string,
  base: string,
): Promise<PublishResult> {
  const published = await graphPost<{ id: string }>(
    `/${igUserId}/media_publish`,
    { creation_id: creationId, access_token: accessToken },
    base,
  );
  return { platform: 'instagram', remoteId: published.id, state: 'published' };
}

export interface IgImageOptions {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption?: string;
  baseUrl?: string;
}

/** Single image: create container -> publish. */
export async function publishInstagramImage(opts: IgImageOptions): Promise<PublishResult> {
  const base = opts.baseUrl ?? GRAPH_BASE;
  const params: Record<string, string> = { image_url: opts.imageUrl, access_token: opts.accessToken };
  if (opts.caption) params.caption = opts.caption;
  const container = await graphPost<{ id: string }>(`/${opts.igUserId}/media`, params, base);
  return publishContainer(opts.igUserId, container.id, opts.accessToken, base);
}

export interface IgReelOptions extends PollOptions {
  igUserId: string;
  accessToken: string;
  videoUrl: string;
  caption?: string;
  baseUrl?: string;
}

/** Reel/video: create REELS container -> poll until processed -> publish. */
export async function publishInstagramReel(opts: IgReelOptions): Promise<PublishResult> {
  const base = opts.baseUrl ?? GRAPH_BASE;
  const params: Record<string, string> = {
    media_type: 'REELS',
    video_url: opts.videoUrl,
    access_token: opts.accessToken,
  };
  if (opts.caption) params.caption = opts.caption;
  const container = await graphPost<{ id: string }>(`/${opts.igUserId}/media`, params, base);
  await pollContainerStatus(container.id, opts.accessToken, base, opts);
  return publishContainer(opts.igUserId, container.id, opts.accessToken, base);
}

export interface IgCarouselOptions extends PollOptions {
  igUserId: string;
  accessToken: string;
  items: { url: string; isVideo: boolean }[];
  caption?: string;
  baseUrl?: string;
}

/** Carousel: create a child container per item (poll videos) -> parent CAROUSEL -> publish. */
export async function publishInstagramCarousel(opts: IgCarouselOptions): Promise<PublishResult> {
  const base = opts.baseUrl ?? GRAPH_BASE;
  const childIds: string[] = [];
  for (const item of opts.items) {
    const p: Record<string, string> = { is_carousel_item: 'true', access_token: opts.accessToken };
    if (item.isVideo) {
      p.media_type = 'VIDEO';
      p.video_url = item.url;
    } else {
      p.image_url = item.url;
    }
    const child = await graphPost<{ id: string }>(`/${opts.igUserId}/media`, p, base);
    if (item.isVideo) await pollContainerStatus(child.id, opts.accessToken, base, opts);
    childIds.push(child.id);
  }
  const parentParams: Record<string, string> = {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    access_token: opts.accessToken,
  };
  if (opts.caption) parentParams.caption = opts.caption;
  const parent = await graphPost<{ id: string }>(`/${opts.igUserId}/media`, parentParams, base);
  return publishContainer(opts.igUserId, parent.id, opts.accessToken, base);
}
