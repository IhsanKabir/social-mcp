import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { request, requestJson } from '../../platform/http/client.js';
import { isVideoAsset, sleep } from '../media-util.js';
import { X_API_BASE } from '../../auth/profiles/x.js';
import type { MediaAsset, PublishResult } from '../types.js';

const CHUNK_BYTES = 4 * 1024 * 1024;
const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_POLL_TIMEOUT = 120_000;

function inferMime(asset: MediaAsset): string {
  if (asset.mime) return asset.mime;
  const ref = asset.path ?? asset.url ?? '';
  const ext = extname(ref.split(/[?#]/)[0] ?? '').toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    default:
      return isVideoAsset(asset) ? 'video/mp4' : 'image/jpeg';
  }
}

function mediaCategory(mime: string, isVideo: boolean): string {
  if (isVideo) return 'tweet_video';
  if (mime === 'image/gif') return 'tweet_gif';
  return 'tweet_image';
}

async function loadMediaBytes(asset: MediaAsset): Promise<{ bytes: Buffer; mime: string }> {
  const fallbackMime = inferMime(asset);
  if (asset.path) {
    return { bytes: readFileSync(asset.path), mime: fallbackMime };
  }
  if (asset.url) {
    const res = await request(asset.url, { method: 'GET' });
    const ab = await res.arrayBuffer();
    const headerMime = res.headers.get('content-type')?.split(';')[0]?.trim();
    return { bytes: Buffer.from(ab), mime: asset.mime ?? headerMime ?? fallbackMime };
  }
  throw new Error('X media asset requires a local file path or a URL.');
}

interface MediaStatusResponse {
  data?: {
    id?: string;
    processing_info?: {
      state?: 'pending' | 'in_progress' | 'succeeded' | 'failed';
      check_after_secs?: number;
      error?: { message?: string; name?: string };
    };
  };
}

/**
 * Upload an image/GIF/video to X via API v2 chunked media upload (media.write scope).
 */
export async function uploadXMedia(
  asset: MediaAsset,
  accessToken: string,
  opts: { baseUrl?: string; pollIntervalMs?: number; pollTimeoutMs?: number } = {},
): Promise<string> {
  const base = opts.baseUrl ?? X_API_BASE;
  const { bytes, mime } = await loadMediaBytes(asset);
  if (bytes.length === 0) throw new Error('X media asset is empty.');

  const category = mediaCategory(mime, isVideoAsset(asset));
  const init = await requestJson<{ data?: { id?: string } }>(`${base}/media/upload/initialize`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    json: {
      media_type: mime,
      total_bytes: bytes.length,
      media_category: category,
    },
  });
  const mediaId = init.data?.id;
  if (!mediaId) throw new Error('X media initialize did not return a media id.');

  const segmentCount = Math.ceil(bytes.length / CHUNK_BYTES);
  for (let i = 0; i < segmentCount; i += 1) {
    const slice = bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
    const form = new FormData();
    form.set('segment_index', String(i));
    form.set('media', new Blob([slice], { type: mime }), 'media');
    await request(`${base}/media/upload/${mediaId}/append`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      body: form,
    });
  }

  const fin = await requestJson<MediaStatusResponse>(`${base}/media/upload/${mediaId}/finalize`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  let proc = fin.data?.processing_info;
  const start = Date.now();
  const timeout = opts.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT;
  while (proc && (proc.state === 'pending' || proc.state === 'in_progress')) {
    if (Date.now() - start > timeout) {
      throw new Error('X media processing timed out.');
    }
    const waitMs = proc.check_after_secs
      ? proc.check_after_secs * 1000
      : (opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL);
    await sleep(waitMs);
    const st = await requestJson<MediaStatusResponse>(
      `${base}/media/upload?command=STATUS&media_id=${encodeURIComponent(mediaId)}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    proc = st.data?.processing_info;
  }

  if (proc?.state === 'failed') {
    throw new Error(`X media processing failed: ${proc.error?.message ?? proc.error?.name ?? 'unknown'}`);
  }

  return mediaId;
}

export interface XPublishOptions {
  accessToken: string;
  text?: string;
  media?: MediaAsset[];
  replyToId?: string;
  username?: string;
  baseUrl?: string;
}

export async function publishXPost(opts: XPublishOptions): Promise<PublishResult> {
  const base = opts.baseUrl ?? X_API_BASE;
  const mediaIds: string[] = [];
  if (opts.media?.length) {
    for (const asset of opts.media.slice(0, 4)) {
      mediaIds.push(await uploadXMedia(asset, opts.accessToken, { baseUrl: base }));
    }
  }

  if (!opts.text?.trim() && mediaIds.length === 0) {
    throw new Error('X post requires text or at least one media attachment.');
  }

  const payload: Record<string, unknown> = {};
  if (opts.text) payload.text = opts.text;
  if (mediaIds.length > 0) payload.media = { media_ids: mediaIds };
  if (opts.replyToId) payload.reply = { in_reply_to_tweet_id: opts.replyToId };

  const res = await requestJson<{ data?: { id?: string; text?: string } }>(`${base}/tweets`, {
    method: 'POST',
    headers: { authorization: `Bearer ${opts.accessToken}` },
    json: payload,
  });

  const remoteId = res.data?.id ?? '';
  if (!remoteId) throw new Error('X did not return a tweet id.');

  const handle = opts.username?.replace(/^@/, '');
  const url = handle
    ? `https://x.com/${handle}/status/${remoteId}`
    : `https://x.com/i/web/status/${remoteId}`;

  return {
    platform: 'x',
    remoteId,
    url,
    state: 'published',
  };
}
