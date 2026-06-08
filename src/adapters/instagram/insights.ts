import { graphGet, GRAPH_BASE } from '../meta/graph.js';
import type { Insights } from '../types.js';

interface RawInsight {
  name: string;
  values?: { value: number }[];
  total_value?: { value: number };
}

const MEDIA_METRICS = 'reach,likes,comments,saved,shares';
const ACCOUNT_METRICS = 'reach';

/** Media-level insights when mediaId is set; otherwise account-level for igUserId. */
export async function getInstagramInsights(
  mediaId: string | null,
  igUserId: string,
  accessToken: string,
  baseUrl: string = GRAPH_BASE,
): Promise<Insights> {
  const params: Record<string, string> = { access_token: accessToken };
  let path: string;
  if (mediaId) {
    path = `/${mediaId}/insights`;
    params.metric = MEDIA_METRICS;
  } else {
    path = `/${igUserId}/insights`;
    params.metric = ACCOUNT_METRICS;
    params.period = 'day';
    params.metric_type = 'total_value';
  }
  const res = await graphGet<{ data?: RawInsight[] }>(path, params, baseUrl);
  const metrics: Record<string, number> = {};
  for (const item of res.data ?? []) {
    const value = item.total_value?.value ?? item.values?.[0]?.value;
    if (typeof value === 'number') metrics[item.name] = value;
  }
  return { remoteId: mediaId ?? undefined, metrics, pulledAt: new Date() };
}
