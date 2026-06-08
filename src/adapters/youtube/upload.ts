import { readFileSync } from 'node:fs';
import { request } from '../../platform/http/client.js';
import { YOUTUBE_UPLOAD_ROOT } from '../../auth/profiles/google.js';

export interface YouTubeUploadOptions {
  accessToken: string;
  filePath: string;
  title: string;
  description: string;
  tags?: string[];
  privacyStatus: 'public' | 'private' | 'unlisted';
  /** When set, the video uploads as private and goes public at this time (status.publishAt). */
  publishAt?: Date;
  mimeType?: string;
  baseUrl?: string;
}

/**
 * Resumable upload: (1) POST metadata to get a session URL (Location header), (2) PUT the
 * bytes to that URL. The file is read into memory for simplicity (fine for v1).
 */
export async function uploadYouTubeVideo(opts: YouTubeUploadOptions): Promise<{ id: string }> {
  const base = opts.baseUrl ?? YOUTUBE_UPLOAD_ROOT;
  const bytes = readFileSync(opts.filePath);
  const mime = opts.mimeType ?? 'video/*';

  const metadata: Record<string, unknown> = {
    snippet: { title: opts.title, description: opts.description, tags: opts.tags ?? [] },
    status: {
      privacyStatus: opts.publishAt ? 'private' : opts.privacyStatus,
      ...(opts.publishAt ? { publishAt: opts.publishAt.toISOString() } : {}),
    },
  };

  const init = await request(
    `${base}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${opts.accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': mime,
        'x-upload-content-length': String(bytes.length),
      },
      json: metadata,
    },
  );

  const sessionUrl = init.headers.get('location');
  if (!sessionUrl) throw new Error('YouTube did not return a resumable upload session URL.');

  const upload = await request(sessionUrl, {
    method: 'PUT',
    headers: { authorization: `Bearer ${opts.accessToken}`, 'content-type': mime },
    body: bytes,
  });
  const data = (await upload.json()) as { id?: string };
  if (!data.id) throw new Error('YouTube upload did not return a video id.');
  return { id: data.id };
}
