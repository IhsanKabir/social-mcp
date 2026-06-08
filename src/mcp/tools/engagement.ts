import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpContext } from '../context.js';
import { jsonResult, errorResult, guard } from '../result.js';
import { getAccount } from '../../services/account-registry.js';
import { getComments, postReply } from '../../services/engagement-service.js';
import { listMentions, setMentionStatus } from '../../services/mentions-repo.js';
import { generateReplyText } from '../../content/content-service.js';

export function registerEngagementTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_comments',
    {
      title: 'Get comments',
      description: 'Fetch comments on a published post (capability-gated per platform).',
      inputSchema: { accountId: z.string(), postRemoteId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ accountId, postRemoteId }) =>
      guard(async () => {
        const comments = await getComments(accountId, postRemoteId, { store: ctx.store });
        return jsonResult({ count: comments.length, comments });
      }),
  );

  server.registerTool(
    'get_mentions',
    {
      title: 'Get mentions',
      description:
        'Show comments discovered by the daemon awaiting your attention (the hybrid-approval inbox).',
      inputSchema: { accountId: z.string().optional(), status: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ accountId, status }) =>
      guard(() => {
        const items = listMentions({
          accountId,
          status: status as 'new' | 'drafted' | 'replied' | 'ignored' | undefined,
        });
        return jsonResult({ count: items.length, mentions: items });
      }),
  );

  server.registerTool(
    'draft_reply',
    {
      title: 'Draft reply',
      description:
        'AI-draft a reply to a comment (does NOT send). Pass the draft to post_reply to publish it.',
      inputSchema: {
        accountId: z.string(),
        commentText: z.string(),
        tone: z.string().optional(),
        mentionId: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ accountId, commentText, tone, mentionId }) =>
      guard(async () => {
        const account = getAccount(accountId);
        if (!account) return errorResult(`Unknown account ${accountId}.`);
        const reply = await generateReplyText({
          platform: account.platform,
          commentText,
          tone,
          sampler: ctx.sampler,
        });
        if (mentionId) setMentionStatus(mentionId, 'drafted');
        return jsonResult({ reply });
      }),
  );

  server.registerTool(
    'post_reply',
    {
      title: 'Post reply',
      description:
        'Publish a reply to a comment. Calling this IS the approval step (the daemon never auto-replies).',
      inputSchema: {
        accountId: z.string(),
        commentId: z.string(),
        text: z.string(),
        mentionId: z.string().optional(),
      },
      annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: false },
    },
    async ({ accountId, commentId, text, mentionId }) =>
      guard(async () => {
        const res = await postReply(accountId, commentId, text, { store: ctx.store });
        if (mentionId) setMentionStatus(mentionId, 'replied');
        return jsonResult({ replied: true, replyId: res.id });
      }),
  );
}
