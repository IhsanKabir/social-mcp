import { randomUUID } from 'node:crypto';
import { loadConfig } from '../../platform/config/load.js';
import { createTokenStore } from '../../auth/store-factory.js';
import { getEncryptionKey } from '../../auth/key-manager.js';
import { registerBuiltinAdapters } from '../../adapters/register.js';
import { getAccount } from '../../services/account-registry.js';
import { publishNow } from '../../services/post-service.js';
import type { Visibility } from '../../adapters/capabilities.js';

export interface PublishCmdOptions {
  text: string;
  visibility?: string;
  idempotencyKey?: string;
}

/** `social-mcp publish <accountId> --text "..."` — publish immediately to a connected account. */
export async function publishCommand(accountId: string, opts: PublishCmdOptions): Promise<void> {
  const account = getAccount(accountId);
  if (!account) {
    throw new Error(`Unknown account "${accountId}". Run \`social-mcp accounts list\`.`);
  }

  const visibility = (opts.visibility ?? 'public') as Visibility;

  const config = loadConfig();
  registerBuiltinAdapters();
  await getEncryptionKey({ allowPrompt: true });
  const store = createTokenStore(config, { allowPrompt: true });

  const idempotencyKey = opts.idempotencyKey ?? randomUUID();
  const outcome = await publishNow({
    accountId,
    text: opts.text,
    visibility,
    idempotencyKey,
    store,
  });

  if (outcome.deduped) {
    process.stdout.write(
      `Already published under idempotency key ${idempotencyKey} → ${outcome.remoteId}\n`,
    );
  } else {
    process.stdout.write(`✓ Published to ${account.platform}/${account.label} → ${outcome.remoteId}\n`);
    if (outcome.url) process.stdout.write(`  ${outcome.url}\n`);
    process.stdout.write(`  idempotency key: ${idempotencyKey}\n`);
  }
}
