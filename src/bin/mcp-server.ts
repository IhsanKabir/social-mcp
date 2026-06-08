#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from '../mcp/server.js';
import { logger } from '../platform/logger.js';

/**
 * MCP server entrypoint (stdio transport). CRITICAL: nothing may write to stdout except the
 * JSON-RPC stream — all logging goes to stderr/file via the logger.
 */
async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('social-mcp MCP server connected (stdio)');
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  logger.error({ err: message }, 'mcp server failed');
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
