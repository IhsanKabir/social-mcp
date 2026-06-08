import { getAccount } from '../../services/account-registry.js';
import { schedulePost } from '../../services/post-service.js';
import { listPosts, cancelPost } from '../../queue/posts-repo.js';
import { listJobs, cancelJob } from '../../queue/job-queue.js';
import type { Visibility } from '../../adapters/capabilities.js';

export interface ScheduleCmdOptions {
  text: string;
  at?: string;
  visibility?: string;
}

/** `social-mcp schedule <accountId> --text "..." [--at <ISO>]` */
export function scheduleCommand(accountId: string, opts: ScheduleCmdOptions): void {
  const account = getAccount(accountId);
  if (!account) throw new Error(`Unknown account "${accountId}". Run \`social-mcp accounts list\`.`);

  let scheduledAt: Date | null = null;
  if (opts.at) {
    const t = new Date(opts.at);
    if (Number.isNaN(t.getTime())) throw new Error(`Invalid --at date: "${opts.at}" (use ISO 8601).`);
    scheduledAt = t;
  }

  const res = schedulePost({
    accountId,
    text: opts.text,
    visibility: (opts.visibility ?? 'public') as Visibility,
    scheduledAt,
  });

  process.stdout.write(
    `✓ Scheduled post ${res.post.id}\n  platform: ${account.platform}/${account.label}\n  mode: ${res.schedulingMode}\n  runs at: ${new Date(res.runAt).toISOString()}\n  job: ${res.jobId}\n`,
  );
  process.stdout.write('Ensure the daemon is running so it publishes: `social-mcp daemon start`\n');
}

/** `social-mcp queue list` — show scheduled/queued posts. */
export function queueListCommand(): void {
  const posts = listPosts();
  if (posts.length === 0) {
    process.stdout.write('No scheduled posts.\n');
    return;
  }
  for (const p of posts) {
    const when = p.scheduledAt ? new Date(p.scheduledAt).toISOString() : 'ASAP';
    const preview = (p.text ?? '').replace(/\s+/g, ' ').slice(0, 60);
    process.stdout.write(`${p.id} [${p.state}] ${p.platform} @ ${when} — ${preview}\n`);
  }
}

/** `social-mcp queue cancel <postId>` — cancel a scheduled post and its pending job. */
export function queueCancelCommand(postId: string): void {
  const ok = cancelPost(postId);
  if (!ok) {
    process.stdout.write(`Post ${postId} not found or not cancellable (already published?).\n`);
    return;
  }
  // Also cancel the matching queued publish job so it doesn't fire and no-op later.
  let canceledJobs = 0;
  for (const job of listJobs({ status: 'queued' })) {
    if (job.type === 'publish' && (job.payload as { scheduledPostId?: string }).scheduledPostId === postId) {
      if (cancelJob(job.id)) canceledJobs += 1;
    }
  }
  process.stdout.write(`Canceled post ${postId}${canceledJobs ? ` and ${canceledJobs} job(s)` : ''}.\n`);
}
