import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpContext } from '../context.js';
import { jsonResult, guard } from '../result.js';
import { generatePostText } from '../../content/content-service.js';

export function registerContentTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'generate_post',
    {
      title: 'Generate post',
      description:
        'Draft a post for a platform (uses the MCP host model via sampling). Returns text you can pass to schedule_post or publish_now. Respects the platform character limit.',
      inputSchema: {
        platform: z.string(),
        topic: z.string(),
        tone: z.string().optional(),
        maxLength: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ platform, topic, tone, maxLength }) =>
      guard(async () => {
        const text = await generatePostText({
          platform,
          topic,
          tone,
          maxLength,
          sampler: ctx.sampler,
        });
        return jsonResult({ platform, text, length: text.length });
      }),
  );
}
