import { graphGet, graphPost, GRAPH_BASE } from '../meta/graph.js';
import type { Comment } from '../types.js';

interface RawComment {
  id: string;
  message?: string;
  created_time?: string;
  from?: { name?: string; id?: string };
}

export async function getFacebookComments(
  objectId: string,
  accessToken: string,
  baseUrl: string = GRAPH_BASE,
): Promise<Comment[]> {
  const res = await graphGet<{ data?: RawComment[] }>(
    `/${objectId}/comments`,
    { access_token: accessToken, fields: 'id,message,created_time,from' },
    baseUrl,
  );
  return (res.data ?? []).map((c) => ({
    id: c.id,
    author: c.from?.name ?? c.from?.id ?? 'unknown',
    text: c.message ?? '',
    createdAt: c.created_time ? new Date(c.created_time) : new Date(0),
    canReply: true,
  }));
}

export async function replyFacebook(
  commentOrObjectId: string,
  text: string,
  accessToken: string,
  baseUrl: string = GRAPH_BASE,
): Promise<{ id: string }> {
  const res = await graphPost<{ id: string }>(
    `/${commentOrObjectId}/comments`,
    { message: text, access_token: accessToken },
    baseUrl,
  );
  return { id: res.id };
}
