import type {
  SocialAdapter,
  PublishRequest,
  PublishResult,
  Comment,
  Insights,
  AuthContext,
} from '../types.js';
import type { PlatformCapabilities } from '../capabilities.js';
import { capabilitiesFor } from '../capabilities.js';
import type { StoredToken } from '../../auth/token-store.js';
import type { OAuthProfile } from '../../auth/profiles/types.js';
import { graphGet } from '../meta/graph.js';
import { publishThread, THREADS_GRAPH_ROOT } from './publish.js';
import { getThreadReplies, replyThread } from './engagement.js';
import { getThreadsInsights } from './insights.js';

/**
 * Threads adapter (graph.threads.net). The stored token is the Threads access token;
 * auth.meta.threadsUserId is the Threads user id. Supports text + single-image posts,
 * reply management, and insights.
 */
export class ThreadsAdapter implements SocialAdapter {
  readonly platform = 'threads' as const;

  capabilities(): PlatformCapabilities {
    return capabilitiesFor('threads');
  }

  private userId(auth: AuthContext): string {
    const id = auth.meta?.threadsUserId;
    if (!id) throw new Error('Missing Threads user id on token. Re-run `social-mcp auth threads`.');
    return id;
  }

  async publish(req: PublishRequest, auth: AuthContext): Promise<PublishResult> {
    const imageUrl = req.media?.find((m) => m.url)?.url;
    if (!req.text && !imageUrl) throw new Error('A Threads post requires text or an image URL.');
    return publishThread({
      userId: this.userId(auth),
      accessToken: auth.accessToken,
      text: req.text,
      imageUrl,
    });
  }

  async getComments(remoteId: string, auth: AuthContext): Promise<Comment[]> {
    return getThreadReplies(remoteId, auth.accessToken);
  }

  async getMentions(_accountId: string, _auth: AuthContext): Promise<Comment[]> {
    return [];
  }

  async reply(commentId: string, text: string, auth: AuthContext): Promise<{ id: string }> {
    return replyThread(this.userId(auth), commentId, text, auth.accessToken);
  }

  async getInsights(remoteId: string | null, auth: AuthContext): Promise<Insights> {
    return getThreadsInsights(remoteId, this.userId(auth), auth.accessToken);
  }

  async refreshAuth(token: StoredToken, _profile: OAuthProfile): Promise<StoredToken | null> {
    // Threads long-lived tokens are refreshed via th_refresh_token (no client secret needed).
    const res = await graphGet<{ access_token?: string; expires_in?: number }>(
      '/refresh_access_token',
      { grant_type: 'th_refresh_token', access_token: token.accessToken },
      THREADS_GRAPH_ROOT,
    );
    if (!res.access_token) return null;
    return {
      ...token,
      accessToken: res.access_token,
      expiresAt: res.expires_in ? Date.now() + res.expires_in * 1000 : token.expiresAt,
      rotatedAt: Date.now(),
    };
  }
}
