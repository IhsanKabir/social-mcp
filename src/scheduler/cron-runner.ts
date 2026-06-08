import type { TokenStore } from '../auth/token-store.js';
import type { SocialAdapter } from '../adapters/types.js';
import { getAdapter } from '../adapters/registry.js';
import { getAuthProvider } from '../auth/providers.js';
import { setAccountStatus, listAccounts } from '../services/account-registry.js';
import { getAccountInsights } from '../services/analytics-service.js';
import { getComments } from '../services/engagement-service.js';
import { setInsightsCache } from '../services/insights-cache.js';
import { upsertMention } from '../services/mentions-repo.js';
import { listPosts } from '../queue/posts-repo.js';
import { logger } from '../platform/logger.js';

export interface CronDeps {
  /** Adapter override for tests; production resolves via the registry. */
  adapter?: SocialAdapter;
}

const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Proactively refresh tokens nearing expiry. Each adapter implements its platform's refresh
 * strategy; a null result means "can't refresh" (e.g. LinkedIn's open-access tier) — if such
 * a token is already expired we flag the account needs_reauth so the user is prompted.
 * Requires adapters + auth providers to be registered (the daemon does this on start).
 */
export async function runRefreshSweep(store: TokenStore, now: number = Date.now()): Promise<void> {
  let tokens;
  try {
    tokens = await store.expiringBefore(now + REFRESH_WINDOW_MS);
  } catch (e) {
    logger.error({ err: (e as Error).message }, 'refresh sweep: could not read tokens');
    return;
  }

  for (const token of tokens) {
    try {
      const adapter = getAdapter(token.platform);
      const provider = getAuthProvider(token.platform);
      const refreshed = await adapter.refreshAuth(token, provider.profile);
      if (refreshed) {
        await store.set(refreshed);
        logger.info({ account: token.accountId, platform: token.platform }, 'token refreshed');
      } else if (token.expiresAt && token.expiresAt <= now) {
        setAccountStatus(token.accountId, 'needs_reauth');
        logger.warn(
          { account: token.accountId, platform: token.platform },
          'token expired and cannot be refreshed — needs re-auth',
        );
      }
    } catch (e) {
      logger.error(
        { account: token.accountId, platform: token.platform, err: (e as Error).message },
        'refresh sweep error for token',
      );
    }
  }
}

/** Refresh cached account-level insights for every account that supports analytics. */
export async function runAnalyticsCache(store: TokenStore, deps: CronDeps = {}): Promise<void> {
  for (const account of listAccounts()) {
    try {
      const insights = await getAccountInsights(account.id, { store, adapter: deps.adapter });
      setInsightsCache(account.id, { metrics: insights.metrics, pulledAt: insights.pulledAt });
    } catch {
      // Capability gap or transient error — skip this account quietly.
    }
  }
}

/**
 * Poll comments on recently published posts and record new ones as mentions for the
 * hybrid-approval reply flow. NEVER replies automatically.
 */
export async function runEngagementPoll(store: TokenStore, deps: CronDeps = {}): Promise<number> {
  let discovered = 0;
  const published = listPosts({ state: 'published' }).filter((p) => p.remoteId);
  for (const post of published) {
    try {
      const comments = await getComments(post.accountId, post.remoteId as string, {
        store,
        adapter: deps.adapter,
      });
      for (const c of comments) {
        if (
          upsertMention({
            id: c.id,
            accountId: post.accountId,
            postRemoteId: post.remoteId,
            author: c.author,
            text: c.text,
            createdAt: c.createdAt.getTime(),
          })
        ) {
          discovered += 1;
        }
      }
    } catch {
      // Platform without comment API, or transient error — skip.
    }
  }
  if (discovered > 0) logger.info({ discovered }, 'engagement poll found new comments');
  return discovered;
}
