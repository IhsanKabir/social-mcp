import { readFileSync } from 'node:fs';
import { request, requestJson } from '../../platform/http/client.js';
import { TIKTOK_API_BASE } from '../../auth/profiles/tiktok.js';
import type { PublishResult } from '../types.js';

export interface TikTokPublishOptions {
  accessToken: string;
  videoPath?: string;
  videoUrl?: string;
  baseUrl?: string;
}

/**
 * Degraded (unaudited) flow: upload the video to the creator's TikTok inbox as a DRAFT via
 * the video.upload scope. The creator finishes posting in the TikTok app. Public direct-post
 * via API requires a TikTok app audit (video.publish) — not available out of the box.
 *
 *  - PULL_FROM_URL: TikTok fetches a public video URL (your app's domain must be verified).
 *  - FILE_UPLOAD: init returns an upload_url; we PUT the bytes (single chunk).
 */
export async function uploadTikTokDraft(opts: TikTokPublishOptions): Promise<PublishResult> {
  const base = opts.baseUrl ?? TIKTOK_API_BASE;
  const initUrl = `${base}/post/publish/inbox/video/init/`;
  let publishId = '';

  if (opts.videoUrl) {
    const res = await requestJson<{ data?: { publish_id?: string } }>(initUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${opts.accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
      },
      json: { source_info: { source: 'PULL_FROM_URL', video_url: opts.videoUrl } },
    });
    publishId = res.data?.publish_id ?? '';
  } else if (opts.videoPath) {
    const bytes = readFileSync(opts.videoPath);
    const init = await requestJson<{ data?: { publish_id?: string; upload_url?: string } }>(initUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${opts.accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
      },
      json: {
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: bytes.length,
          chunk_size: bytes.length,
          total_chunk_count: 1,
        },
      },
    });
    publishId = init.data?.publish_id ?? '';
    const uploadUrl = init.data?.upload_url;
    if (!uploadUrl) throw new Error('TikTok did not return an upload URL.');
    await request(uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': 'video/mp4',
        'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
      },
      body: bytes,
    });
  } else {
    throw new Error('TikTok requires a video file path or a public video URL.');
  }

  // state 'draft': it's in the user's TikTok inbox awaiting them to finish posting.
  return { platform: 'tiktok', remoteId: publishId, state: 'draft' };
}
