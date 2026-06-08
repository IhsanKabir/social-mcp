import { requestJson } from '../../platform/http/client.js';
import { YOUTUBE_API_BASE } from '../../auth/profiles/google.js';
import type { Comment } from '../types.js';

interface CommentThreadItem {
  snippet?: {
    topLevelComment?: {
      id?: string;
      snippet?: { authorDisplayName?: string; textOriginal?: string; publishedAt?: string };
    };
  };
}

export async function getYouTubeComments(
  videoId: string,
  accessToken: string,
  baseUrl: string = YOUTUBE_API_BASE,
): Promise<Comment[]> {
  const url = new URL(`${baseUrl}/commentThreads`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('videoId', videoId);
  url.searchParams.set('maxResults', '50');
  const res = await requestJson<{ items?: CommentThreadItem[] }>(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return (res.items ?? []).map((it) => {
    const top = it.snippet?.topLevelComment;
    const s = top?.snippet;
    return {
      id: top?.id ?? '',
      author: s?.authorDisplayName ?? 'unknown',
      text: s?.textOriginal ?? '',
      createdAt: s?.publishedAt ? new Date(s.publishedAt) : new Date(0),
      canReply: true,
    };
  });
}

/** Reply to a top-level comment (comments.insert with parentId). Requires youtube.force-ssl. */
export async function replyYouTube(
  parentId: string,
  text: string,
  accessToken: string,
  baseUrl: string = YOUTUBE_API_BASE,
): Promise<{ id: string }> {
  const res = await requestJson<{ id: string }>(`${baseUrl}/comments?part=snippet`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    json: { snippet: { parentId, textOriginal: text } },
  });
  return { id: res.id };
}
