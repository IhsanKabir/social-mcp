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
import { CapabilityError } from '../capability-error.js';
import type { StoredToken } from '../../auth/token-store.js';
import type { OAuthProfile } from '../../auth/profiles/types.js';
import { exchangeLongLivedToken } from '../meta/graph.js';
import { publishInstagramImage } from './container.js';
import { getInstagramComments, replyInstagram } from './engagement.js';
import { getInstagramInsights } from './insights.js';

/**
 * Instagram adapter (Business/Creator account linked to a Facebook Page). The stored token is
 * the Page access token; auth.meta.igUserId is the IG user id. v1 publishes a single image via
 * a public URL (Instagram fetches it). Text-only posts are not allowed by the API.
 */
export class InstagramAdapter implements SocialAdapter {
  readonly platform = 'instagram' as const;

  capabilities(): PlatformCapabilities {
    return capabilitiesFor('instagram');
  }

  private igUserId(auth: AuthContext): string {
    const id = auth.meta?.igUserId;
    if (!id) throw new Error('Missing Instagram user id on token. Re-run `social-mcp auth instagram`.');
    return id;
  }

  async publish(req: PublishRequest, auth: AuthContext): Promise<PublishResult> {
    const imageUrl = req.media?.find((m) => m.url)?.url;
    if (!imageUrl) {
      throw new CapabilityError(
        'instagram',
        'text-only or binary publishing',
        'Instagram requires a public image URL (provide imageUrls). Video/carousel coming later.',
      );
    }
    return publishInstagramImage({
      igUserId: this.igUserId(auth),
      accessToken: auth.accessToken,
      imageUrl,
      caption: req.text,
    });
  }

  async getComments(remoteId: string, auth: AuthContext): Promise<Comment[]> {
    return getInstagramComments(remoteId, auth.accessToken);
  }

  async getMentions(_accountId: string, _auth: AuthContext): Promise<Comment[]> {
    return [];
  }

  async reply(commentId: string, text: string, auth: AuthContext): Promise<{ id: string }> {
    return replyInstagram(commentId, text, auth.accessToken);
  }

  async getInsights(remoteId: string | null, auth: AuthContext): Promise<Insights> {
    return getInstagramInsights(remoteId, this.igUserId(auth), auth.accessToken);
  }

  async refreshAuth(token: StoredToken, _profile: OAuthProfile): Promise<StoredToken | null> {
    const clientId = token.meta?.clientId;
    const clientSecret = token.meta?.clientSecret;
    if (!clientId || !clientSecret) return null;
    const refreshed = await exchangeLongLivedToken({ clientId, clientSecret }, token.accessToken);
    return { ...token, accessToken: refreshed.token, expiresAt: refreshed.expiresAt, rotatedAt: Date.now() };
  }
}
