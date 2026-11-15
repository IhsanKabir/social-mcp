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
import { requestJson } from '../../platform/http/client.js';
import { X_TOKEN_URL } from '../../auth/profiles/x.js';
import { publishXPost } from './publish.js';
import { getXReplies, getXMentions, replyX } from './engagement.js';
import { getXInsights } from './insights.js';

/**
 * X (Twitter) adapter using API v2 with OAuth 2.0 User Context (PKCE).
 * Scheduling is emulated by the local daemon.
 */
export class XAdapter implements SocialAdapter {
  readonly platform = 'x' as const;

  capabilities(): PlatformCapabilities {
    return capabilitiesFor('x');
  }

  private userId(auth: AuthContext): string {
    const id = auth.meta?.userId;
    if (!id) throw new Error('X auth context is missing meta.userId. Re-run `social-mcp auth x`.');
    return id;
  }

  async publish(req: PublishRequest, auth: AuthContext): Promise<PublishResult> {
    return publishXPost({
      accessToken: auth.accessToken,
      text: req.text,
      media: req.media,
      username: auth.meta?.username,
    });
  }

  async getComments(remoteId: string, auth: AuthContext): Promise<Comment[]> {
    return getXReplies(remoteId, auth.accessToken);
  }

  async getMentions(_accountId: string, auth: AuthContext): Promise<Comment[]> {
    return getXMentions(this.userId(auth), auth.accessToken);
  }

  async reply(commentId: string, text: string, auth: AuthContext): Promise<{ id: string }> {
    return replyX(commentId, text, auth.accessToken);
  }

  async getInsights(remoteId: string | null, auth: AuthContext): Promise<Insights> {
    return getXInsights(remoteId, this.userId(auth), auth.accessToken);
  }

  async refreshAuth(token: StoredToken, _profile: OAuthProfile): Promise<StoredToken | null> {
    if (!token.refreshToken) return null;
    const clientId = token.meta?.clientId;
    const clientSecret = token.meta?.clientSecret;
    if (!clientId || !clientSecret) return null;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      client_id: clientId,
    });
    const res = await requestJson<{
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    }>(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: body.toString(),
    });
    if (!res.access_token) return null;
    return {
      ...token,
      accessToken: res.access_token,
      refreshToken: res.refresh_token ?? token.refreshToken,
      expiresAt: res.expires_in ? Date.now() + res.expires_in * 1000 : token.expiresAt,
      rotatedAt: Date.now(),
    };
  }
}
