import type { PlatformId } from '../platform/ids.js';

/**
 * A platform OAuth token plus the extras an adapter needs. The whole record is encrypted
 * at rest; only non-secret fields (expiresAt, scopes) are mirrored in cleartext columns
 * for the daemon's refresh-sweep queries.
 */
export interface StoredToken {
  accountId: string;
  platform: PlatformId;
  accessToken: string;
  refreshToken?: string | null;
  /** epoch ms, or null if the platform doesn't expose an expiry. */
  expiresAt?: number | null;
  scopes: string[];
  /** Platform-specific: page_id, ig_user_id, channel_id, open_id, person urn, ... */
  meta?: Record<string, string>;
  obtainedAt: number;
  rotatedAt?: number;
}

/** Non-secret summary of a stored token — safe to return from list(). */
export interface TokenSummary {
  accountId: string;
  platform: PlatformId;
  scopes: string[];
  expiresAt?: number | null;
}

export interface TokenStore {
  get(accountId: string): Promise<StoredToken | null>;
  set(token: StoredToken): Promise<void>;
  delete(accountId: string): Promise<void>;
  /** Never returns secrets. */
  list(): Promise<TokenSummary[]>;
  /** Tokens expiring before `beforeMs` — drives the daemon refresh sweep. */
  expiringBefore(beforeMs: number): Promise<StoredToken[]>;
}
