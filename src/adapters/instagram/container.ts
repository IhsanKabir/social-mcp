import { graphPost, GRAPH_BASE } from '../meta/graph.js';
import type { PublishResult } from '../types.js';

export interface IgPublishOptions {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption?: string;
  baseUrl?: string;
}

/**
 * Publish a single image to Instagram using the two-step container -> publish flow. Instagram
 * requires a publicly reachable image URL (it fetches the media itself; binary upload isn't
 * supported). Video/Reels and carousels require status polling and are a later addition.
 */
export async function publishInstagramImage(opts: IgPublishOptions): Promise<PublishResult> {
  const base = opts.baseUrl ?? GRAPH_BASE;

  const containerParams: Record<string, string> = {
    image_url: opts.imageUrl,
    access_token: opts.accessToken,
  };
  if (opts.caption) containerParams.caption = opts.caption;

  const container = await graphPost<{ id: string }>(
    `/${opts.igUserId}/media`,
    containerParams,
    base,
  );

  const published = await graphPost<{ id: string }>(
    `/${opts.igUserId}/media_publish`,
    { creation_id: container.id, access_token: opts.accessToken },
    base,
  );

  return {
    platform: 'instagram',
    remoteId: published.id,
    url: undefined,
    state: 'published',
  };
}
