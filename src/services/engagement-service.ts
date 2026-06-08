import type { TokenStore } from '../auth/token-store.js';
import type { SocialAdapter, Comment } from '../adapters/types.js';
import { CapabilityError } from '../adapters/capability-error.js';
import { resolveAdapter, buildAuthContext } from './account-registry.js';

export interface EngagementDeps {
  store: TokenStore;
  /** Adapter override for tests; production resolves via the registry. */
  adapter?: SocialAdapter;
}

export async function getComments(
  accountId: string,
  remoteId: string,
  deps: EngagementDeps,
): Promise<Comment[]> {
  const { account, adapter } = resolveAdapter(accountId, deps.adapter);
  if (!adapter.capabilities().engagement.readComments) {
    throw new CapabilityError(account.platform, 'read comments');
  }
  const auth = await buildAuthContext(accountId, deps.store);
  return adapter.getComments(remoteId, auth);
}

export async function getMentions(accountId: string, deps: EngagementDeps): Promise<Comment[]> {
  const { account, adapter } = resolveAdapter(accountId, deps.adapter);
  if (!adapter.capabilities().engagement.readMentions) {
    throw new CapabilityError(account.platform, 'read mentions');
  }
  const auth = await buildAuthContext(accountId, deps.store);
  return adapter.getMentions(accountId, auth);
}

/**
 * Publish a reply. Calling this is itself the approval step (hybrid policy): the daemon never
 * auto-replies — replies are only sent when explicitly requested via this path.
 */
export async function postReply(
  accountId: string,
  commentId: string,
  text: string,
  deps: EngagementDeps,
): Promise<{ id: string }> {
  const { account, adapter } = resolveAdapter(accountId, deps.adapter);
  if (!adapter.capabilities().engagement.reply) {
    throw new CapabilityError(account.platform, 'reply to comments');
  }
  const auth = await buildAuthContext(accountId, deps.store);
  return adapter.reply(commentId, text, auth);
}
