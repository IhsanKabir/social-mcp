import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpContext } from '../context.js';
import { jsonResult, errorResult, guard } from '../result.js';
import { getAccount } from '../../services/account-registry.js';
import { publishNow, schedulePost } from '../../services/post-service.js';
import { listPosts, cancelPost } from '../../queue/posts-repo.js';
import { listJobs, cancelJob } from '../../queue/job-queue.js';
import type { Visibility } from '../../adapters/capabilities.js';
import type { PostState } from '../../queue/types.js';

export function registerPublishTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'publish_now',
    {
      title: 'Publish now',
      description: 'Publish a post immediately to a connected account.',
      inputSchema: {
        accountId: z.string(),
        text: z.string().optional(),
        visibility: z.string().optional(),
        imageUrls: z.array(z.string()).optional(),
        videoPath: z.string().optional(),
      },
      // Affects the outside world; not idempotent. Hosts may require confirmation.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ accountId, text, visibility, imageUrls, videoPath }) =>
      guard(async () => {
        const account = getAccount(accountId);
        if (!account) return errorResult(`Unknown account ${accountId}.`);
        const media = [
          ...(imageUrls?.map((url) => ({ url })) ?? []),
          ...(videoPath ? [{ path: videoPath }] : []),
        ];
        const outcome = await publishNow({
          accountId,
          text,
          visibility: visibility as Visibility | undefined,
          media: media.length ? media : undefined,
          idempotencyKey: randomUUID(),
          store: ctx.store,
        });
        return jsonResult({
          published: !outcome.deduped,
          deduped: outcome.deduped,
          remoteId: outcome.remoteId,
          url: outcome.url ?? null,
        });
      }),
  );

  server.registerTool(
    'schedule_post',
    {
      title: 'Schedule post',
      description:
        'Queue a post for later. The daemon publishes it at the scheduled time (local scheduling) or hands a future time to the platform (native scheduling), chosen automatically by capability.',
      inputSchema: {
        accountId: z.string(),
        text: z.string().optional(),
        at: z.string().optional(),
        visibility: z.string().optional(),
        imageUrls: z.array(z.string()).optional(),
        videoPath: z.string().optional(),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ accountId, text, at, visibility, imageUrls, videoPath }) =>
      guard(() => {
        const account = getAccount(accountId);
        if (!account) return errorResult(`Unknown account ${accountId}.`);
        let scheduledAt: Date | null = null;
        if (at) {
          const t = new Date(at);
          if (Number.isNaN(t.getTime())) return errorResult(`Invalid "at" date: ${at} (use ISO 8601).`);
          scheduledAt = t;
        }
        const res = schedulePost({
          accountId,
          text,
          visibility: visibility as Visibility | undefined,
          mediaRefs: [...(imageUrls ?? []), ...(videoPath ? [videoPath] : [])],
          scheduledAt,
        });
        const note =
          res.schedulingMode === 'local'
            ? 'Local scheduling: the daemon must be running to publish at this time (`social-mcp daemon start`).'
            : "Native scheduling: the future time was handed to the platform's scheduler.";
        return jsonResult({
          postId: res.post.id,
          schedulingMode: res.schedulingMode,
          runAt: new Date(res.runAt).toISOString(),
          note,
        });
      }),
  );

  server.registerTool(
    'list_scheduled',
    {
      title: 'List scheduled posts',
      description: 'List scheduled/queued posts and their state.',
      inputSchema: { state: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ state }) =>
      guard(() => {
        const posts = listPosts(state ? { state: state as PostState } : {}).map((p) => ({
          id: p.id,
          platform: p.platform,
          state: p.state,
          scheduledAt: p.scheduledAt ? new Date(p.scheduledAt).toISOString() : null,
          text: p.text,
          remoteId: p.remoteId,
          remoteUrl: p.remoteUrl,
        }));
        return jsonResult({ count: posts.length, posts });
      }),
  );

  server.registerTool(
    'cancel_scheduled',
    {
      title: 'Cancel scheduled post',
      description: 'Cancel a scheduled post (and its pending publish job) before it runs.',
      inputSchema: { postId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ postId }) =>
      guard(() => {
        const ok = cancelPost(postId);
        if (!ok) {
          return errorResult(`Post ${postId} not found or not cancellable (already published?).`);
        }
        let canceledJobs = 0;
        for (const job of listJobs({ status: 'queued' })) {
          if (
            job.type === 'publish' &&
            (job.payload as { scheduledPostId?: string }).scheduledPostId === postId &&
            cancelJob(job.id)
          ) {
            canceledJobs += 1;
          }
        }
        return jsonResult({ canceled: true, postId, canceledJobs });
      }),
  );
}
