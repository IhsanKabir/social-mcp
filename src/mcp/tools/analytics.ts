import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpContext } from '../context.js';
import { jsonResult, guard } from '../result.js';
import {
  getPostInsights,
  getAccountInsights,
  generateReport,
} from '../../services/analytics-service.js';

export function registerAnalyticsTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_post_insights',
    {
      title: 'Get post insights',
      description: 'Metrics for a specific post (capability-gated per platform).',
      inputSchema: { accountId: z.string(), postRemoteId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ accountId, postRemoteId }) =>
      guard(async () => {
        const insights = await getPostInsights(accountId, postRemoteId, { store: ctx.store });
        return jsonResult(insights);
      }),
  );

  server.registerTool(
    'get_account_insights',
    {
      title: 'Get account insights',
      description: 'Account-level metrics for a connected account.',
      inputSchema: { accountId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ accountId }) =>
      guard(async () => {
        const insights = await getAccountInsights(accountId, { store: ctx.store });
        return jsonResult(insights);
      }),
  );

  server.registerTool(
    'generate_report',
    {
      title: 'Generate report',
      description:
        'Aggregate account-level metrics across all connected accounts (capability-aware).',
      annotations: { readOnlyHint: true },
    },
    async () =>
      guard(async () => {
        const report = await generateReport({ store: ctx.store });
        return jsonResult({ accounts: report });
      }),
  );
}
