import { graphPost, GRAPH_BASE } from '../meta/graph.js';
import type { PublishResult } from '../types.js';

export interface FacebookPublishOptions {
  pageId: string;
  accessToken: string;
  text?: string;
  imageUrl?: string;
  /** Future time => native scheduling via scheduled_publish_time + published=false. */
  scheduledAt?: Date;
  baseUrl?: string;
}

/**
 * Publish (or natively schedule) a Facebook Page post. A single image is posted via
 * /photos by URL; text/link posts go to /feed. Facebook requires scheduled times to be
 * 10 minutes–75 days out.
 */
export async function publishFacebookPost(opts: FacebookPublishOptions): Promise<PublishResult> {
  const base = opts.baseUrl ?? GRAPH_BASE;
  const scheduled = Boolean(opts.scheduledAt && opts.scheduledAt.getTime() > Date.now());
  const schedParams: Record<string, string> = scheduled
    ? {
        published: 'false',
        scheduled_publish_time: String(Math.floor(opts.scheduledAt!.getTime() / 1000)),
      }
    : {};

  if (opts.imageUrl) {
    const params: Record<string, string> = {
      url: opts.imageUrl,
      access_token: opts.accessToken,
      ...schedParams,
    };
    if (opts.text) params.caption = opts.text;
    const res = await graphPost<{ id?: string; post_id?: string }>(
      `/${opts.pageId}/photos`,
      params,
      base,
    );
    const id = res.post_id ?? res.id ?? '';
    return toResult(id, scheduled);
  }

  const params: Record<string, string> = {
    message: opts.text ?? '',
    access_token: opts.accessToken,
    ...schedParams,
  };
  const res = await graphPost<{ id: string }>(`/${opts.pageId}/feed`, params, base);
  return toResult(res.id, scheduled);
}

function toResult(id: string, scheduled: boolean): PublishResult {
  return {
    platform: 'facebook',
    remoteId: id,
    url: id ? `https://www.facebook.com/${id}` : undefined,
    state: scheduled ? 'scheduled' : 'published',
  };
}
