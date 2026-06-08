import { requestJson } from '../../platform/http/client.js';

/**
 * Shared Meta Graph API helpers (Facebook Pages + Instagram). Threads uses graph.threads.net
 * and is handled in its own adapter. The API version is pinned; bump deliberately.
 */
export const GRAPH_VERSION = 'v21.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export async function graphGet<T = unknown>(
  path: string,
  params: Record<string, string>,
  baseUrl: string = GRAPH_BASE,
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return requestJson<T>(url.toString());
}

export async function graphPost<T = unknown>(
  path: string,
  params: Record<string, string>,
  baseUrl: string = GRAPH_BASE,
): Promise<T> {
  const body = new URLSearchParams(params);
  return requestJson<T>(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

export interface LongLivedToken {
  token: string;
  expiresAt: number | null;
}

/**
 * Exchange a short-lived user token for a long-lived one (~60 days). Page tokens derived
 * from a long-lived user token are themselves long-lived.
 */
export async function exchangeLongLivedToken(
  creds: { clientId: string; clientSecret: string },
  shortToken: string,
  baseUrl: string = GRAPH_BASE,
): Promise<LongLivedToken> {
  const res = await graphGet<{ access_token: string; expires_in?: number }>(
    '/oauth/access_token',
    {
      grant_type: 'fb_exchange_token',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      fb_exchange_token: shortToken,
    },
    baseUrl,
  );
  return {
    token: res.access_token,
    expiresAt: res.expires_in ? Date.now() + res.expires_in * 1000 : null,
  };
}
