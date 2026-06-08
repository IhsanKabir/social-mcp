import { graphGet, graphPost, GRAPH_BASE } from '../meta/graph.js';
import type { Comment } from '../types.js';

interface RawComment {
  id: string;
  text?: string;
  timestamp?: string;
  username?: string;
}

export async function getInstagramComments(
  mediaId: string,
  accessToken: string,
  baseUrl: string = GRAPH_BASE,
): Promise<Comment[]> {
  const res = await graphGet<{ data?: RawComment[] }>(
    `/${mediaId}/comments`,
    { access_token: accessToken, fields: 'id,text,timestamp,username' },
    baseUrl,
  );
  return (res.data ?? []).map((c) => ({
    id: c.id,
    author: c.username ?? 'unknown',
    text: c.text ?? '',
    createdAt: c.timestamp ? new Date(c.timestamp) : new Date(0),
    canReply: true,
  }));
}

/** Reply to an Instagram comment (POST /{comment-id}/replies). */
export async function replyInstagram(
  commentId: string,
  text: string,
  accessToken: string,
  baseUrl: string = GRAPH_BASE,
): Promise<{ id: string }> {
  const res = await graphPost<{ id: string }>(
    `/${commentId}/replies`,
    { message: text, access_token: accessToken },
    baseUrl,
  );
  return { id: res.id };
}
