import { requestJson } from '../../platform/http/client.js';

/**
 * YouTube Analytics API (time-series), complementing the snapshot statistics in analytics.ts.
 * Requires the yt-analytics.readonly scope (already requested at auth time).
 */
export const YT_ANALYTICS_BASE = 'https://youtubeanalytics.googleapis.com/v2';

export interface YouTubeAnalytics {
  columns: string[];
  rows: (string | number)[][];
}

export interface YouTubeAnalyticsOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  metrics?: string;
  baseUrl?: string;
}

export async function getYouTubeAnalytics(
  accessToken: string,
  opts: YouTubeAnalyticsOptions,
): Promise<YouTubeAnalytics> {
  const url = new URL(`${opts.baseUrl ?? YT_ANALYTICS_BASE}/reports`);
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', opts.startDate);
  url.searchParams.set('endDate', opts.endDate);
  url.searchParams.set('metrics', opts.metrics ?? 'views,estimatedMinutesWatched,likes,subscribersGained');
  url.searchParams.set('dimensions', 'day');
  const res = await requestJson<{ columnHeaders?: { name: string }[]; rows?: (string | number)[][] }>(
    url.toString(),
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  return {
    columns: (res.columnHeaders ?? []).map((c) => c.name),
    rows: res.rows ?? [],
  };
}
