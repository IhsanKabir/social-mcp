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
import { isVideoAsset } from '../media-util.js';
import {
  publishInstagramImage,
  publishInstagramReel,
  publishInstagramCarousel,
} from './container.js';
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
    const items = (req.media ?? []).filter((m) => m.url);
    if (items.length === 0) {
      throw new CapabilityError(
        'instagram',
        'text-only or binary publishing',
        'Instagram requires at least one public media URL (provide imageUrls).',
      );
    }
    const igUserId = this.igUserId(auth);
    const accessToken = auth.accessToken;

    if (items.length > 1) {
      return publishInstagramCarousel({
        igUserId,
        accessToken,
        items: items.map((m) => ({ url: m.url as string, isVideo: isVideoAsset(m) })),
        caption: req.text,
      });
    }

    const only = items[0]!;
    if (isVideoAsset(only)) {
      return publishInstagramReel({ igUserId, accessToken, videoUrl: only.url as string, caption: req.text });
    }
    return publishInstagramImage({ igUserId, accessToken, imageUrl: only.url as string, caption: req.text });
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
