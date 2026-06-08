import { graphGet, GRAPH_BASE } from '../meta/graph.js';
import type { Insights } from '../types.js';

interface RawInsight {
  name: string;
  values?: { value: number }[];
}

const POST_METRICS = 'post_impressions,post_engaged_users,post_reactions_by_type_total';
const PAGE_METRICS = 'page_impressions,page_post_engagements,page_fans';

/** Post-level insights when objectId is set; otherwise page-level for pageId. */
export async function getFacebookInsights(
  objectId: string | null,
  pageId: string,
  accessToken: string,
  baseUrl: string = GRAPH_BASE,
): Promise<Insights> {
  const target = objectId ?? pageId;
  const metric = objectId ? POST_METRICS : PAGE_METRICS;
  const res = await graphGet<{ data?: RawInsight[] }>(
    `/${target}/insights`,
    { access_token: accessToken, metric },
    baseUrl,
  );
  const metrics: Record<string, number> = {};
  for (const item of res.data ?? []) {
    const value = item.values?.[0]?.value;
    if (typeof value === 'number') metrics[item.name] = value;
  }
  return { remoteId: objectId ?? undefined, metrics, pulledAt: new Date() };
}
