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
import {
  TIKTOK_API_BASE,
  TIKTOK_TOKEN_URL,
  TIKTOK_USERINFO_URL,
} from '../../auth/profiles/tiktok.js';
import { uploadTikTokVideo } from './publish.js';

function grantedScopes(meta?: Record<string, string>): Set<string> {
  return new Set(
    (meta?.scopes ?? '')
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * TikTok adapter. Uses draft inbox upload (video.upload) by default, and supports direct
 * publishing (video.publish) and Display API insights (user.info.stats / video.list) when
 * those scopes are granted. Comments/replies are not available via official public APIs.
 */
export class TikTokAdapter implements SocialAdapter {
  readonly platform = 'tiktok' as const;

  capabilities(): PlatformCapabilities {
    return capabilitiesFor('tiktok');
  }

  async publish(req: PublishRequest, auth: AuthContext): Promise<PublishResult> {
    const video = req.media?.find((m) => m.url || m.path);
    const videoUrl = video?.url;
    const videoPath = video?.path;
    if (!videoUrl && !videoPath) {
      throw new CapabilityError(
        'tiktok',
        'non-video publishing',
        'TikTok requires a video file path or a public video URL.',
      );
    }

    const scopes = grantedScopes(auth.meta);
    const canDirect = scopes.has('video.publish') && req.visibility !== 'draft';

    return uploadTikTokVideo({
      accessToken: auth.accessToken,
      videoUrl,
      videoPath,
      mime: video?.mime,
      caption: req.text,
      visibility: req.visibility,
      mode: canDirect ? 'direct' : 'draft',
    });
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

  async getInsights(remoteId: string | null, auth: AuthContext): Promise<Insights> {
    const scopes = grantedScopes(auth.meta);
    if (remoteId === null && scopes.has('user.info.stats')) {
      const res = await requestJson<{
        data?: {
          user?: {
            follower_count?: number;
            following_count?: number;
            likes_count?: number;
            video_count?: number;
          };
        };
        error?: { code?: string; message?: string };
      }>(
        `${TIKTOK_USERINFO_URL}?fields=follower_count,following_count,likes_count,video_count`,
        { headers: { authorization: `Bearer ${auth.accessToken}` } },
      );
      if (res.error?.code && res.error.code !== 'ok') {
        throw new Error(`TikTok error (${res.error.code}): ${res.error.message || 'failed'}`);
      }
      const u = res.data?.user ?? {};
      return {
        metrics: {
          followers: u.follower_count ?? 0,
          following: u.following_count ?? 0,
          likes: u.likes_count ?? 0,
          videos: u.video_count ?? 0,
        },
        pulledAt: new Date(),
      };
    }

    if (remoteId && scopes.has('video.list')) {
      const res = await requestJson<{
        data?: {
          videos?: {
            id?: string;
            view_count?: number;
            like_count?: number;
            comment_count?: number;
            share_count?: number;
          }[];
        };
        error?: { code?: string; message?: string };
      }>(
        `${TIKTOK_API_BASE}/video/query/?fields=id,like_count,comment_count,share_count,view_count`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${auth.accessToken}`,
            'content-type': 'application/json; charset=UTF-8',
          },
          json: { filters: { video_ids: [remoteId] } },
        },
      );
      if (res.error?.code && res.error.code !== 'ok') {
        throw new Error(`TikTok error (${res.error.code}): ${res.error.message || 'failed'}`);
      }
      const v = res.data?.videos?.[0];
      return {
        remoteId,
        metrics: {
          views: v?.view_count ?? 0,
          likes: v?.like_count ?? 0,
          comments: v?.comment_count ?? 0,
          shares: v?.share_count ?? 0,
        },
        pulledAt: new Date(),
      };
    }

    throw new CapabilityError(
      'tiktok',
      'analytics',
      'requires user.info.stats / video.list scopes (or Display API enabled on your TikTok app)',
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
    const res = await requestJson<{
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    }>(
      TIKTOK_TOKEN_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );
    if (res.error || !res.access_token) return null;
    return {
      ...token,
      accessToken: res.access_token,
      refreshToken: res.refresh_token ?? token.refreshToken,
      expiresAt: res.expires_in ? Date.now() + res.expires_in * 1000 : token.expiresAt,
      rotatedAt: Date.now(),
    };
  }
}
