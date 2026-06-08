import type { TokenStore } from '../auth/token-store.js';
import type { SocialAdapter, Insights } from '../adapters/types.js';
import type { PlatformId } from '../platform/ids.js';
import { CapabilityError } from '../adapters/capability-error.js';
import { resolveAdapter, buildAuthContext, listAccounts } from './account-registry.js';

export interface AnalyticsDeps {
  store: TokenStore;
  adapter?: SocialAdapter;
}

export async function getPostInsights(
  accountId: string,
  remoteId: string,
  deps: AnalyticsDeps,
): Promise<Insights> {
  const { account, adapter } = resolveAdapter(accountId, deps.adapter);
  if (!adapter.capabilities().analytics.postInsights) {
    throw new CapabilityError(account.platform, 'post insights');
  }
  const auth = await buildAuthContext(accountId, deps.store);
  return adapter.getInsights(remoteId, auth);
}

export async function getAccountInsights(accountId: string, deps: AnalyticsDeps): Promise<Insights> {
  const { account, adapter } = resolveAdapter(accountId, deps.adapter);
  if (!adapter.capabilities().analytics.accountInsights) {
    throw new CapabilityError(account.platform, 'account insights');
  }
  const auth = await buildAuthContext(accountId, deps.store);
  return adapter.getInsights(null, auth);
}

export interface AccountReport {
  accountId: string;
  platform: PlatformId;
  label: string;
  metrics?: Record<string, number>;
  note?: string;
}

/** Aggregate account-level insights across all connected accounts (capability-aware). */
export async function generateReport(deps: AnalyticsDeps): Promise<AccountReport[]> {
  const out: AccountReport[] = [];
  for (const account of listAccounts()) {
    const base = { accountId: account.id, platform: account.platform, label: account.label };
    try {
      const insights = await getAccountInsights(account.id, deps);
      out.push({ ...base, metrics: insights.metrics });
    } catch (e) {
      out.push({ ...base, note: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
