import { graphGet } from '../meta/graph.js';
import { THREADS_BASE } from './publish.js';
import type { Insights } from '../types.js';

interface RawInsight {
  name: string;
  values?: { value: number }[];
  total_value?: { value: number };
}

const MEDIA_METRICS = 'views,likes,replies,reposts,quotes';
const USER_METRICS = 'views,likes,replies,followers_count';

export async function getThreadsInsights(
  threadId: string | null,
  userId: string,
  accessToken: string,
  baseUrl: string = THREADS_BASE,
): Promise<Insights> {
  const path = threadId ? `/${threadId}/insights` : `/${userId}/threads_insights`;
  const res = await graphGet<{ data?: RawInsight[] }>(
    path,
    { access_token: accessToken, metric: threadId ? MEDIA_METRICS : USER_METRICS },
    baseUrl,
  );
  const metrics: Record<string, number> = {};
  for (const item of res.data ?? []) {
    const value = item.total_value?.value ?? item.values?.[0]?.value;
    if (typeof value === 'number') metrics[item.name] = value;
  }
  return { remoteId: threadId ?? undefined, metrics, pulledAt: new Date() };
}
