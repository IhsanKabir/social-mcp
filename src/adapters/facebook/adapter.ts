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
import { exchangeLongLivedToken } from '../meta/graph.js';
import { publishFacebookPost } from './publish.js';
import { getFacebookComments, replyFacebook } from './engagement.js';
import { getFacebookInsights } from './insights.js';

/**
 * Facebook Page adapter. The stored token IS the Page access token; auth.meta.pageId is the
 * Page id. Supports text + single-image posts, native scheduling, comments, replies, insights.
 */
export class FacebookAdapter implements SocialAdapter {
  readonly platform = 'facebook' as const;

  capabilities(): PlatformCapabilities {
    return capabilitiesFor('facebook');
  }

  private pageId(auth: AuthContext): string {
    const id = auth.meta?.pageId;
    if (!id) throw new Error('Missing Facebook pageId on token. Re-run `social-mcp auth facebook`.');
    return id;
  }

  async publish(req: PublishRequest, auth: AuthContext): Promise<PublishResult> {
    const imageUrl = req.media?.find((m) => m.url)?.url;
    if (!req.text && !imageUrl) throw new Error('A Facebook post requires text or an image URL.');
    return publishFacebookPost({
      pageId: this.pageId(auth),
      accessToken: auth.accessToken,
      text: req.text,
      imageUrl,
      scheduledAt: req.scheduledAt,
    });
  }

  async getComments(remoteId: string, auth: AuthContext): Promise<Comment[]> {
    return getFacebookComments(remoteId, auth.accessToken);
  }

  async getMentions(_accountId: string, auth: AuthContext): Promise<Comment[]> {
    // Page mentions/tagged are surfaced via the page's tagged/visitor_posts edges; approximate
    // with recent comments on the page feed is out of scope for v1. Return empty for now.
    void auth;
    return [];
  }

  async reply(commentId: string, text: string, auth: AuthContext): Promise<{ id: string }> {
    return replyFacebook(commentId, text, auth.accessToken);
  }

  async getInsights(remoteId: string | null, auth: AuthContext): Promise<Insights> {
    return getFacebookInsights(remoteId, this.pageId(auth), auth.accessToken);
  }

  async refreshAuth(token: StoredToken, _profile: OAuthProfile): Promise<StoredToken | null> {
    // Re-extend the long-lived token if we have app creds in token.meta (set at auth time).
    const clientId = token.meta?.clientId;
    const clientSecret = token.meta?.clientSecret;
    if (!clientId || !clientSecret) return null;
    const refreshed = await exchangeLongLivedToken({ clientId, clientSecret }, token.accessToken);
    return {
      ...token,
      accessToken: refreshed.token,
      expiresAt: refreshed.expiresAt,
      rotatedAt: Date.now(),
    };
  }
}
