import { requestJson } from '../../platform/http/client.js';
import { HttpError } from '../../platform/http/errors.js';
import { CapabilityError } from '../capability-error.js';
import { X_API_BASE } from '../../auth/profiles/x.js';
import { publishXPost } from './publish.js';
import type { Comment } from '../types.js';

interface RawTweet {
  id: string;
  text?: string;
  author_id?: string;
  created_at?: string;
}

interface TweetsResponse {
  data?: RawTweet[];
  includes?: { users?: { id: string; username?: string; name?: string }[] };
}

function mapTweets(res: TweetsResponse, excludeId?: string): Comment[] {
  const users = new Map<string, string>();
  for (const u of res.includes?.users ?? []) {
    users.set(u.id, u.username ? `@${u.username}` : (u.name ?? u.id));
  }
  return (res.data ?? [])
    .filter((t) => t.id !== excludeId)
    .map((t) => ({
      id: t.id,
      author: (t.author_id && users.get(t.author_id)) || t.author_id || 'unknown',
      text: t.text ?? '',
      createdAt: t.created_at ? new Date(t.created_at) : new Date(0),
      canReply: true,
    }));
}

function wrapTierError(e: unknown, capability: string): never {
  if (e instanceof HttpError && (e.status === 402 || e.status === 403)) {
    throw new CapabilityError(
      'x',
      capability,
      'X API rejected this read (Free tier does not include search/mentions; Basic tier or higher is required)',
    );
  }
  throw e;
}

export async function getXReplies(
  tweetId: string,
  accessToken: string,
  baseUrl: string = X_API_BASE,
): Promise<Comment[]> {
  const params = new URLSearchParams({
    query: `conversation_id:${tweetId}`,
    'tweet.fields': 'author_id,created_at,conversation_id',
    expansions: 'author_id',
    'user.fields': 'username,name',
    max_results: '50',
  });
  try {
    const res = await requestJson<TweetsResponse>(`${baseUrl}/tweets/search/recent?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    return mapTweets(res, tweetId);
  } catch (e) {
    wrapTierError(e, 'read comments');
  }
}

export async function getXMentions(
  userId: string,
  accessToken: string,
  baseUrl: string = X_API_BASE,
): Promise<Comment[]> {
  const params = new URLSearchParams({
    'tweet.fields': 'author_id,created_at,conversation_id',
    expansions: 'author_id',
    'user.fields': 'username,name',
    max_results: '20',
  });
  try {
    const res = await requestJson<TweetsResponse>(`${baseUrl}/users/${userId}/mentions?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    return mapTweets(res);
  } catch (e) {
    wrapTierError(e, 'read mentions');
  }
}

export async function replyX(
  commentId: string,
  text: string,
  accessToken: string,
  baseUrl: string = X_API_BASE,
): Promise<{ id: string }> {
  const res = await publishXPost({ accessToken, text, replyToId: commentId, baseUrl });
  return { id: res.remoteId };
}
