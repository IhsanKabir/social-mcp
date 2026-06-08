import { listAccounts, deleteAccount, getAccount } from '../../services/account-registry.js';
import { capabilitiesFor } from '../../adapters/capabilities.js';

/** `social-mcp accounts list` — show connected accounts and a one-line capability summary. */
export function accountsListCommand(): void {
  const accounts = listAccounts();
  if (accounts.length === 0) {
    process.stdout.write('No accounts connected. Run `social-mcp auth <platform>` to add one.\n');
    return;
  }
  const lines = accounts.map((a) => {
    const caps = capabilitiesFor(a.platform);
    const can: string[] = [];
    if (caps.publish.media.length) can.push('publish');
    if (caps.publish.scheduling !== 'none') can.push(`schedule(${caps.publish.scheduling})`);
    if (caps.engagement.reply) can.push('reply');
    if (caps.analytics.postInsights) can.push('analytics');
    return `${a.id}\n  ${a.platform}/${a.label} [${a.status}] — ${can.join(', ')}`;
  });
  process.stdout.write(lines.join('\n') + '\n');
}

/** `social-mcp accounts remove <id>` — disconnect an account (also drops its token via cascade). */
export function accountsRemoveCommand(id: string): void {
  const account = getAccount(id);
  if (!account) {
    process.stdout.write(`No account with id ${id}.\n`);
    return;
  }
  deleteAccount(id);
  process.stdout.write(`Removed ${account.platform}/${account.label} (${id}).\n`);
}
