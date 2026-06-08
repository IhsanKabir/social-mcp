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
import { requestJson } from '../../platform/http/client.js';
import { TIKTOK_TOKEN_URL } from '../../auth/profiles/tiktok.js';
import { uploadTikTokDraft } from './publish.js';

/**
 * TikTok adapter — DEGRADED for unaudited apps. publish() uploads the video to the creator's
 * TikTok inbox as a draft (video.upload). Public posting and any engagement/analytics require
 * a manual app audit / are unavailable to normal developers, so those throw CapabilityError.
 */
export class TikTokAdapter implements SocialAdapter {
  readonly platform = 'tiktok' as const;

  capabilities(): PlatformCapabilities {
    return capabilitiesFor('tiktok');
  }

  async publish(req: PublishRequest, auth: AuthContext): Promise<PublishResult> {
    const videoUrl = req.media?.find((m) => m.url)?.url;
    const videoPath = req.media?.find((m) => m.path)?.path;
    if (!videoUrl && !videoPath) {
      throw new CapabilityError(
        'tiktok',
        'non-video publishing',
        'TikTok requires a video file path or a public video URL.',
      );
    }
    return uploadTikTokDraft({ accessToken: auth.accessToken, videoUrl, videoPath });
  }

  async getComments(_remoteId: string, _auth: AuthContext): Promise<Comment[]> {
    throw new CapabilityError(
      'tiktok',
      'read comments',
      'no public comments API for normal developers (Research API is academic-gated)',
    );
  }

  async getMentions(_accountId: string, _auth: AuthContext): Promise<Comment[]> {
    throw new CapabilityError('tiktok', 'read mentions');
  }

  async reply(_commentId: string, _text: string, _auth: AuthContext): Promise<{ id: string }> {
    throw new CapabilityError('tiktok', 'reply to comments');
  }

  async getInsights(_remoteId: string | null, _auth: AuthContext): Promise<Insights> {
    throw new CapabilityError(
      'tiktok',
      'analytics',
      'no analytics API for normal developers',
    );
  }

  async refreshAuth(token: StoredToken, _profile: OAuthProfile): Promise<StoredToken | null> {
    if (!token.refreshToken) return null;
    const clientKey = token.meta?.clientId;
    const clientSecret = token.meta?.clientSecret;
    if (!clientKey || !clientSecret) return null;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      client_key: clientKey,
      client_secret: clientSecret,
    });
    const res = await requestJson<{ access_token?: string; expires_in?: number; refresh_token?: string }>(
      TIKTOK_TOKEN_URL,
      { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() },
    );
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
