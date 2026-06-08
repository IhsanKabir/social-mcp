import { requestJson } from '../../platform/http/client.js';
import { YOUTUBE_API_BASE } from '../../auth/profiles/google.js';
import type { Insights } from '../types.js';

/**
 * v1 uses the Data API `statistics` part (viewCount, likeCount, commentCount for a video;
 * subscriberCount, viewCount, videoCount for a channel). Time-series via the YouTube
 * Analytics API is a later addition.
 */
function numify(stats: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) {
    const n = Number(v);
    if (!Number.isNaN(n)) out[k] = n;
  }
  return out;
}

export async function getYouTubeInsights(
  videoId: string | null,
  channelId: string,
  accessToken: string,
  baseUrl: string = YOUTUBE_API_BASE,
): Promise<Insights> {
  const resource = videoId ? 'videos' : 'channels';
  const id = videoId ?? channelId;
  const url = new URL(`${baseUrl}/${resource}`);
  url.searchParams.set('part', 'statistics');
  url.searchParams.set('id', id);
  const res = await requestJson<{ items?: { statistics?: Record<string, string> }[] }>(
    url.toString(),
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  const stats = res.items?.[0]?.statistics ?? {};
  return { remoteId: videoId ?? undefined, metrics: numify(stats), pulledAt: new Date() };
}
