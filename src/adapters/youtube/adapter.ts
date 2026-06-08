import { basename } from 'node:path';
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
import { GOOGLE_TOKEN_URL } from '../../auth/profiles/google.js';
import { uploadYouTubeVideo } from './upload.js';
import { getYouTubeComments, replyYouTube } from './engagement.js';
import { getYouTubeInsights } from './analytics.js';
import { assertUploadQuota, recordUpload } from './quota.js';

/**
 * YouTube adapter. A "post" is a video upload: req.media must include a local video file
 * path; req.text becomes the description (first line -> title). Supports native scheduling
 * via status.publishAt (uploads private, goes public at the time), comments, and analytics.
 */
export class YouTubeAdapter implements SocialAdapter {
  readonly platform = 'youtube' as const;

  capabilities(): PlatformCapabilities {
    return capabilitiesFor('youtube');
  }

  private channelId(auth: AuthContext): string {
    const id = auth.meta?.channelId;
    if (!id) throw new Error('Missing YouTube channelId on token. Re-run `social-mcp auth youtube`.');
    return id;
  }

  async publish(req: PublishRequest, auth: AuthContext): Promise<PublishResult> {
    const filePath = req.media?.find((m) => m.path)?.path;
    if (!filePath) {
      throw new CapabilityError(
        'youtube',
        'non-video publishing',
        'YouTube requires a local video file (provide videoPath).',
      );
    }
    assertUploadQuota();

    const firstLine = (req.text ?? '').split('\n')[0]?.trim() ?? '';
    const title = (firstLine || basename(filePath)).slice(0, 100);
    const scheduled = Boolean(req.scheduledAt && req.scheduledAt.getTime() > Date.now());

    const { id } = await uploadYouTubeVideo({
      accessToken: auth.accessToken,
      filePath,
      title,
      description: req.text ?? '',
      privacyStatus: 'public',
      publishAt: scheduled ? req.scheduledAt : undefined,
    });
    recordUpload();

    return {
      platform: 'youtube',
      remoteId: id,
      url: `https://youtu.be/${id}`,
      state: scheduled ? 'scheduled' : 'published',
    };
  }

  async getComments(remoteId: string, auth: AuthContext): Promise<Comment[]> {
    return getYouTubeComments(remoteId, auth.accessToken);
  }

  async getMentions(_accountId: string, _auth: AuthContext): Promise<Comment[]> {
    return [];
  }

  async reply(commentId: string, text: string, auth: AuthContext): Promise<{ id: string }> {
    return replyYouTube(commentId, text, auth.accessToken);
  }

  async getInsights(remoteId: string | null, auth: AuthContext): Promise<Insights> {
    return getYouTubeInsights(remoteId, this.channelId(auth), auth.accessToken);
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
      client_secret: clientSecret,
    });
    const res = await requestJson<{ access_token: string; expires_in?: number }>(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return {
      ...token,
      accessToken: res.access_token,
      expiresAt: res.expires_in ? Date.now() + res.expires_in * 1000 : token.expiresAt,
      rotatedAt: Date.now(),
    };
  }
}
