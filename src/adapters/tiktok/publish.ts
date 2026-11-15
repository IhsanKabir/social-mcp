import { readFileSync } from 'node:fs';
import { request, requestJson } from '../../platform/http/client.js';
import { TIKTOK_API_BASE } from '../../auth/profiles/tiktok.js';
import type { PublishResult } from '../types.js';
import type { Visibility } from '../capabilities.js';

export type TikTokPublishMode = 'draft' | 'direct';

export interface TikTokPublishOptions {
  accessToken: string;
  videoPath?: string;
  videoUrl?: string;
  mime?: string;
  caption?: string;
  visibility?: Visibility;
  mode?: TikTokPublishMode;
  baseUrl?: string;
}

interface TikTokInitResponse {
  data?: { publish_id?: string; upload_url?: string };
  error?: { code?: string; message?: string; log_id?: string };
}

const MAX_SINGLE_CHUNK_BYTES = 64 * 1024 * 1024;
const MULTI_CHUNK_BYTES = 10 * 1024 * 1024;

function mapPrivacyLevel(v?: Visibility): string {
  switch (v) {
    case 'public':
      return 'PUBLIC_TO_EVERYONE';
    case 'connections':
      return 'MUTUAL_FOLLOW_FRIENDS';
    case 'self_only':
    default:
      return 'SELF_ONLY';
  }
}

function assertTikTokOk(res: TikTokInitResponse): void {
  const code = res.error?.code;
  if (code && code !== 'ok') {
    throw new Error(`TikTok error (${code}): ${res.error?.message || 'request failed'}`);
  }
}

/**
 * Publish a video to TikTok:
 *  - mode = 'draft' (default, scope video.upload): uploads to the creator's TikTok inbox
 *    via /post/publish/inbox/video/init/ so they finish posting in the TikTok app.
 *  - mode = 'direct' (audited apps with video.publish): posts directly via
 *    /post/publish/video/init/ with post_info (caption + privacy_level).
 *
 * Supports both PULL_FROM_URL and chunked FILE_UPLOAD (single chunk <= 64 MB, 10 MB chunks above).
 */
export async function uploadTikTokVideo(opts: TikTokPublishOptions): Promise<PublishResult> {
  const base = opts.baseUrl ?? TIKTOK_API_BASE;
  const mode: TikTokPublishMode = opts.mode ?? 'draft';
  const initUrl =
    mode === 'direct'
      ? `${base}/post/publish/video/init/`
      : `${base}/post/publish/inbox/video/init/`;

  const postInfo =
    mode === 'direct'
      ? {
          post_info: {
            title: opts.caption ?? '',
            privacy_level: mapPrivacyLevel(opts.visibility),
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
        }
      : {};

  let publishId = '';

  if (opts.videoUrl) {
    const res = await requestJson<TikTokInitResponse>(initUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${opts.accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
      },
      json: {
        ...postInfo,
        source_info: { source: 'PULL_FROM_URL', video_url: opts.videoUrl },
      },
    });
    assertTikTokOk(res);
    publishId = res.data?.publish_id ?? '';
  } else if (opts.videoPath) {
    const bytes = readFileSync(opts.videoPath);
    if (bytes.length === 0) throw new Error('TikTok video file is empty.');

    const singleChunk = bytes.length <= MAX_SINGLE_CHUNK_BYTES;
    const chunkSize = singleChunk ? bytes.length : MULTI_CHUNK_BYTES;
    const totalChunkCount = singleChunk ? 1 : Math.floor(bytes.length / chunkSize);

    const init = await requestJson<TikTokInitResponse>(initUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${opts.accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
      },
      json: {
        ...postInfo,
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: bytes.length,
          chunk_size: chunkSize,
          total_chunk_count: totalChunkCount,
        },
      },
    });
    assertTikTokOk(init);
    publishId = init.data?.publish_id ?? '';
    const uploadUrl = init.data?.upload_url;
    if (!uploadUrl) throw new Error('TikTok did not return an upload URL.');

    const contentType = opts.mime ?? 'video/mp4';
    for (let i = 0; i < totalChunkCount; i += 1) {
      const start = i * chunkSize;
      const end = i === totalChunkCount - 1 ? bytes.length : (i + 1) * chunkSize;
      const chunk = bytes.subarray(start, end);
      await request(uploadUrl, {
        method: 'PUT',
        headers: {
          'content-type': contentType,
          'content-length': String(chunk.length),
          'content-range': `bytes ${start}-${end - 1}/${bytes.length}`,
        },
        body: chunk,
      });
    }
  } else {
    throw new Error('TikTok requires a video file path or a public video URL.');
  }

  if (!publishId) throw new Error('TikTok did not return a publish_id.');

  return {
    platform: 'tiktok',
    remoteId: publishId,
    state: mode === 'direct' ? 'processing' : 'draft',
  };
}

/** Backwards-compatible alias for draft uploads. */
export const uploadTikTokDraft = uploadTikTokVideo;
