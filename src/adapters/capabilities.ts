import type { PlatformId } from '../platform/ids.js';

/**
 * scheduling support:
 *   native   = platform accepts a future publish time (Facebook, YouTube)
 *   emulated = platform has no scheduling; OUR daemon holds the post and publishes at time
 *   none     = neither (reserved; should not occur once the daemon exists)
 */
export type SchedulingSupport = 'native' | 'emulated' | 'none';

export type MediaKind = 'text' | 'image' | 'video' | 'carousel';

export type Visibility = 'public' | 'self_only' | 'draft' | 'connections';

export interface RateBudget {
  /** Human-readable note surfaced to the agent, e.g. "~6 uploads/day (quota)". */
  note: string;
  perDay?: number | null;
  perHour?: number | null;
}

export type RefreshStrategy =
  | 'google_refresh'
  | 'meta_longlived'
  | 'linkedin_reauth'
  | 'tiktok_refresh';

export interface PlatformCapabilities {
  platform: PlatformId;
  displayName: string;

  publish: {
    media: MediaKind[];
    scheduling: SchedulingSupport;
    /** true if publishing is async/2-step (IG container->publish, video processing). */
    twoStep: boolean;
    /** Platform forces non-public output until app audit (e.g. TikTok unaudited). */
    forcedVisibility?: Visibility | null;
    maxTextLength?: number;
    imageSpec?: { formats: string[]; maxBytes?: number; note?: string };
  };

  engagement: {
    readComments: boolean;
    readMentions: boolean;
    reply: boolean;
    moderate: boolean;
  };

  analytics: {
    postInsights: boolean;
    accountInsights: boolean;
  };

  auth: {
    refreshStrategy: RefreshStrategy;
    /** Scopes that trigger app review / restricted handling. */
    restrictedScopes?: string[];
    /** Clone-and-run caveat surfaced in `doctor` and the setup wizard. */
    setupNote?: string;
  };

  rate: RateBudget;
}

/**
 * Static capability table — a property of each platform's API, not of any account.
 * The CapabilityResolver merges this with per-account state to produce effective caps.
 * Values reflect official-API research (see plan).
 */
export const CAPABILITIES: Record<PlatformId, PlatformCapabilities> = {
  linkedin: {
    platform: 'linkedin',
    displayName: 'LinkedIn',
    publish: {
      media: ['text', 'image', 'video'],
      scheduling: 'emulated',
      twoStep: false,
      maxTextLength: 3000,
    },
    engagement: { readComments: false, readMentions: false, reply: false, moderate: false },
    analytics: { postInsights: false, accountInsights: false },
    auth: {
      refreshStrategy: 'linkedin_reauth',
      setupNote:
        'Open-access "Share on LinkedIn" product: personal posting only. No comment/analytics API. Tokens (~60d) cannot be silently refreshed — re-run `social-mcp auth linkedin` when they expire.',
    },
    rate: { note: '~150 posts/day per member', perDay: 150 },
  },

  facebook: {
    platform: 'facebook',
    displayName: 'Facebook Page',
    publish: {
      media: ['text', 'image', 'video', 'carousel'],
      scheduling: 'native',
      twoStep: false,
    },
    engagement: { readComments: true, readMentions: true, reply: true, moderate: true },
    analytics: { postInsights: true, accountInsights: true },
    auth: {
      refreshStrategy: 'meta_longlived',
      restrictedScopes: ['pages_manage_posts', 'pages_read_engagement'],
      setupNote:
        'Requires a Meta app + a Facebook Page. Managing Pages you do not own needs App Review + Business Verification; your own Page works in development with you as an app role.',
    },
    rate: { note: 'Business-use-case rate limits (token-tier dependent)' },
  },

  instagram: {
    platform: 'instagram',
    displayName: 'Instagram',
    publish: {
      media: ['image', 'video', 'carousel'],
      scheduling: 'emulated',
      twoStep: true,
      maxTextLength: 2200,
      imageSpec: { formats: ['image/jpeg'], note: 'JPEG only; normalize before upload' },
    },
    engagement: { readComments: true, readMentions: true, reply: true, moderate: true },
    analytics: { postInsights: true, accountInsights: true },
    auth: {
      refreshStrategy: 'meta_longlived',
      setupNote:
        'Requires an Instagram Business/Creator account linked to a Facebook Page, via a Meta app. Publishing uses a container->publish two-step flow; ~100 API posts / 24h.',
    },
    rate: { note: '~100 API posts / 24h', perDay: 100 },
  },

  threads: {
    platform: 'threads',
    displayName: 'Threads',
    publish: {
      media: ['text', 'image', 'video', 'carousel'],
      scheduling: 'emulated',
      twoStep: true,
      maxTextLength: 500,
    },
    engagement: { readComments: true, readMentions: false, reply: true, moderate: false },
    analytics: { postInsights: true, accountInsights: true },
    auth: {
      refreshStrategy: 'meta_longlived',
      setupNote:
        'Requires an Instagram Business/Creator account + Threads profile, via a Meta app. Impression-based rate limits: new accounts are heavily throttled.',
    },
    rate: { note: 'Impression-based (4800 x impressions / 24h)' },
  },

  youtube: {
    platform: 'youtube',
    displayName: 'YouTube',
    publish: {
      media: ['video'],
      scheduling: 'native',
      twoStep: false,
    },
    engagement: { readComments: true, readMentions: false, reply: true, moderate: true },
    analytics: { postInsights: true, accountInsights: true },
    auth: {
      refreshStrategy: 'google_refresh',
      restrictedScopes: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.force-ssl',
      ],
      setupNote:
        'Restricted scopes: an unverified app is capped at ~100 users and (in Testing mode) refresh tokens expire after 7 days — publish your OAuth app to Production to stop that. ~6 uploads/day on the default 10,000-unit quota.',
    },
    rate: { note: '~6 uploads/day (videos.insert ~1600 units of 10,000)', perDay: 6 },
  },

  tiktok: {
    platform: 'tiktok',
    displayName: 'TikTok',
    publish: {
      media: ['video'],
      scheduling: 'emulated',
      twoStep: true,
      forcedVisibility: 'draft',
    },
    engagement: { readComments: false, readMentions: false, reply: false, moderate: false },
    analytics: { postInsights: false, accountInsights: false },
    auth: {
      refreshStrategy: 'tiktok_refresh',
      setupNote:
        'DRAFT-ONLY via API: uploads a video to your TikTok inbox (video.upload); finish posting in the TikTok app. Public direct-post needs a manual TikTok app audit (video.publish). No engagement/analytics API for normal developers.',
    },
    rate: { note: 'Unaudited: draft uploads only; ~5 users / 24h' },
  },
};

export function capabilitiesFor(platform: PlatformId): PlatformCapabilities {
  return CAPABILITIES[platform];
}
