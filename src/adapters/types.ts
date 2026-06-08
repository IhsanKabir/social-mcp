import type { PlatformId } from '../platform/ids.js';
import type { PlatformCapabilities, Visibility } from './capabilities.js';
import type { StoredToken } from '../auth/token-store.js';
import type { OAuthProfile } from '../auth/profiles/types.js';

/**
 * A media asset. Either a local file `path` or a publicly reachable `url`. Several official
 * APIs (Instagram, Threads, Facebook photo-by-URL) require a public URL rather than a binary
 * upload, so URL is the primary path for the Meta family in v1.
 */
export interface MediaAsset {
  url?: string;
  path?: string;
  mime?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface PublishRequest {
  accountId: string;
  text?: string;
  media?: MediaAsset[];
  /** Future time => native scheduling when the platform supports it. */
  scheduledAt?: Date;
  visibility?: Visibility;
  /** Equals the job id; used for cross-retry idempotency. */
  idempotencyKey: string;
}

export interface PublishResult {
  platform: PlatformId;
  remoteId: string;
  url?: string;
  state: 'published' | 'scheduled' | 'processing' | 'draft';
  raw?: unknown;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  createdAt: Date;
  parentId?: string;
  canReply: boolean;
}

export interface Insights {
  /** Post-level when set; omit for account-level. */
  remoteId?: string;
  metrics: Record<string, number>;
  pulledAt: Date;
}

/**
 * Per-call auth context. Built fresh by AccountRegistry from the TokenStore and injected
 * into every adapter call. Adapters NEVER hold tokens — this keeps them stateless and
 * trivially testable, and avoids stale-token bugs.
 */
export interface AuthContext {
  accessToken: string;
  /** Platform extras carried on the token (page_id, ig_user_id, channel_id, urn, ...). */
  meta?: Record<string, string>;
  /** Adapter calls this to persist a token it rotated mid-flight. */
  onTokenRotated?: (token: StoredToken) => Promise<void>;
}

/**
 * The contract every platform implements. One instance per platform, stateless, reused.
 */
export interface SocialAdapter {
  readonly platform: PlatformId;

  capabilities(): PlatformCapabilities;

  publish(req: PublishRequest, auth: AuthContext): Promise<PublishResult>;

  getComments(remoteId: string, auth: AuthContext): Promise<Comment[]>;
  getMentions(accountId: string, auth: AuthContext): Promise<Comment[]>;
  reply(commentId: string, text: string, auth: AuthContext): Promise<{ id: string }>;

  getInsights(remoteId: string | null, auth: AuthContext): Promise<Insights>;

  /** Refresh/extend per this platform's strategy. Return the new token, or null if still valid. */
  refreshAuth(token: StoredToken, profile: OAuthProfile): Promise<StoredToken | null>;
}
