import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/** Reusable prompt templates the host can surface to the user. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'draft-post',
    {
      title: 'Draft a post',
      description: 'Draft a social post for a platform about a topic.',
      argsSchema: { platform: z.string(), topic: z.string(), tone: z.string().optional() },
    },
    ({ platform, topic, tone }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Draft a ${platform} post about: ${topic}.${tone ? ` Tone: ${tone}.` : ''} Respect the platform's character limit and conventions. Return only the post text. When it's ready, you can schedule it with the schedule_post tool.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'weekly-report',
    {
      title: 'Weekly report',
      description: 'Summarize the past week across all connected accounts.',
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Using the list_accounts and get_account_insights tools (where supported), summarize the past week across all connected accounts: what was posted, engagement highlights, and 3 suggestions for next week.',
          },
        },
      ],
    }),
  );
}
