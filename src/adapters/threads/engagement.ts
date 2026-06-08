import { graphGet } from '../meta/graph.js';
import { publishThread, THREADS_BASE } from './publish.js';
import type { Comment } from '../types.js';

interface RawReply {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
}

export async function getThreadReplies(
  threadId: string,
  accessToken: string,
  baseUrl: string = THREADS_BASE,
): Promise<Comment[]> {
  const res = await graphGet<{ data?: RawReply[] }>(
    `/${threadId}/replies`,
    { access_token: accessToken, fields: 'id,text,username,timestamp' },
    baseUrl,
  );
  return (res.data ?? []).map((r) => ({
    id: r.id,
    author: r.username ?? 'unknown',
    text: r.text ?? '',
    createdAt: r.timestamp ? new Date(r.timestamp) : new Date(0),
    canReply: true,
  }));
}

export async function replyThread(
  userId: string,
  parentId: string,
  text: string,
  accessToken: string,
  baseUrl: string = THREADS_BASE,
): Promise<{ id: string }> {
  const res = await publishThread({ userId, accessToken, text, replyToId: parentId, baseUrl });
  return { id: res.remoteId };
}
