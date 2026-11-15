import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpContext } from '../context.js';
import { jsonResult, errorResult, guard } from '../result.js';
import { listAccounts } from '../../services/account-registry.js';
import { capabilitiesFor } from '../../adapters/capabilities.js';
import { PLATFORMS, isPlatformId } from '../../platform/ids.js';

export function registerAccountTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_accounts',
    {
      title: 'List accounts',
      description: 'List connected social accounts with a summary of what each can do.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      guard(() => {
        const accounts = listAccounts().map((a) => {
          const c = capabilitiesFor(a.platform);
          return {
            id: a.id,
            platform: a.platform,
            label: a.label,
            status: a.status,
            can: {
              media: c.publish.media,
              scheduling: c.publish.scheduling,
              reply: c.engagement.reply,
              analytics: c.analytics.postInsights,
            },
          };
        });
        return jsonResult({ count: accounts.length, accounts });
      }),
  );

  server.registerTool(
    'get_capabilities',
    {
      title: 'Get capabilities',
      description:
        'What a platform (or a specific account) can and cannot do via the official API. Consult before publishing/scheduling/replying.',
      inputSchema: { platform: z.string().optional(), accountId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ platform, accountId }) =>
      guard(() => {
        let p = platform;
        if (!p && accountId) {
          p = listAccounts().find((a) => a.id === accountId)?.platform;
        }
        if (!p || !isPlatformId(p)) {
          return errorResult(
            `Provide a valid platform (${PLATFORMS.join(', ')}) or a known accountId.`,
          );
        }
        return jsonResult(capabilitiesFor(p));
      }),
  );

  server.registerTool(
    'account_health',
    {
      title: 'Account health',
      description: 'Token presence, scopes, expiry, and re-auth status for each account.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      guard(async () => {
        const summaries = await ctx.store.list();
        const now = Date.now();
        const rows = listAccounts().map((a) => {
          const s = summaries.find((x) => x.accountId === a.id);
          const expiresAt = s?.expiresAt ?? null;
          const daysUntilExpiry =
            expiresAt != null ? Math.round((expiresAt - now) / 86_400_000) : null;
          const needsReauth =
            a.status === 'needs_reauth' || !s || (expiresAt != null && expiresAt < now);
          return {
            id: a.id,
            platform: a.platform,
            label: a.label,
            status: a.status,
            hasToken: Boolean(s),
            scopes: s?.scopes ?? [],
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
            daysUntilExpiry,
            needsReauth,
          };
        });
        return jsonResult({ accounts: rows });
      }),
  );
}
