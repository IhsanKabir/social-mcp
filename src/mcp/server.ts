import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../platform/config/load.js';
import { createTokenStore } from '../auth/store-factory.js';
import { registerBuiltinAdapters } from '../adapters/register.js';
import { registerBuiltinAuthProviders } from '../auth/providers.js';
import { createMcpSampler } from './sampler.js';
import type { McpContext } from './context.js';
import { registerAccountTools } from './tools/accounts.js';
import { registerContentTools } from './tools/content.js';
import { registerPublishTools } from './tools/publish.js';
import { registerEngagementTools } from './tools/engagement.js';
import { registerAnalyticsTools } from './tools/analytics.js';
import { registerOpsTools } from './tools/ops.js';
import { registerResources } from './resources.js';
import { registerPrompts } from './prompts.js';

export const SERVER_NAME = 'social-mcp';
export const SERVER_VERSION = '0.1.0';

/**
 * Build the MCP server with all tools, resources, and prompts registered. The token store is
 * lazy (it only resolves the encryption key when a token-using tool runs), so read-only tools
 * work even if SOCIAL_MCP_KEY isn't set.
 */
export function buildServer(): McpServer {
  registerBuiltinAdapters();
  registerBuiltinAuthProviders();

  const config = loadConfig();
  const store = createTokenStore(config);

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const ctx: McpContext = { store, sampler: createMcpSampler(server) };

  registerAccountTools(server, ctx);
  registerContentTools(server, ctx);
  registerPublishTools(server, ctx);
  registerEngagementTools(server, ctx);
  registerAnalyticsTools(server, ctx);
  registerOpsTools(server);
  registerResources(server, ctx);
  registerPrompts(server);

  return server;
}
