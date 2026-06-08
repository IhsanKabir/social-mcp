import { randomUUID } from 'node:crypto';
import { Cron } from 'croner';
import type { TokenStore } from '../auth/token-store.js';
import type { SocialAdapter } from '../adapters/types.js';
import { claimDueJob, reclaimStaleJobs } from '../queue/job-queue.js';
import { processJob } from './due-processor.js';
import { runRefreshSweep, runAnalyticsCache, runEngagementPoll } from './cron-runner.js';
import { registerBuiltinAdapters } from '../adapters/register.js';
import { registerBuiltinAuthProviders } from '../auth/providers.js';
import { logger } from '../platform/logger.js';

/** Max jobs drained per tick before yielding back to the timer. */
const DRAIN_BATCH = 25;
const DEFAULT_POLL_MS = 15_000;
const DEFAULT_REFRESH_CRON = '0 * * * *'; // hourly
const DEFAULT_ANALYTICS_CRON = '0 */6 * * *'; // every 6 hours
const DEFAULT_ENGAGEMENT_CRON = '*/30 * * * *'; // every 30 minutes

export interface DaemonOptions {
  store: TokenStore;
  pollIntervalMs?: number;
  daemonId?: string;
  /** Adapter override for tests; production resolves adapters via the registry. */
  adapter?: SocialAdapter;
  /** Cron expression for the token-refresh sweep. */
  refreshCron?: string;
  /** Cron expression for the analytics cache refresh. */
  analyticsCron?: string;
  /** Cron expression for the comment/engagement poll. */
  engagementCron?: string;
}

/**
 * The autonomous scheduler. On each tick it reclaims stale jobs (crash recovery) and drains
 * due jobs through the publish path. A separate cron runs the token-refresh sweep. It is the
 * sole writer of publish results; the MCP server only enqueues.
 */
export class Daemon {
  private readonly store: TokenStore;
  private readonly pollIntervalMs: number;
  private readonly daemonId: string;
  private readonly adapter?: SocialAdapter;
  private readonly refreshCron: string;
  private readonly analyticsCron: string;
  private readonly engagementCron: string;

  private running = false;
  private timer?: ReturnType<typeof setTimeout>;
  private crons: Cron[] = [];

  constructor(opts: DaemonOptions) {
    this.store = opts.store;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_MS;
    this.daemonId = opts.daemonId ?? `daemon-${process.pid}-${randomUUID().slice(0, 8)}`;
    this.adapter = opts.adapter;
    this.refreshCron = opts.refreshCron ?? DEFAULT_REFRESH_CRON;
    this.analyticsCron = opts.analyticsCron ?? DEFAULT_ANALYTICS_CRON;
    this.engagementCron = opts.engagementCron ?? DEFAULT_ENGAGEMENT_CRON;
  }

  start(): void {
    registerBuiltinAdapters();
    registerBuiltinAuthProviders();
    this.running = true;
    this.crons = [
      new Cron(this.refreshCron, () => void runRefreshSweep(this.store)),
      new Cron(this.analyticsCron, () => void runAnalyticsCache(this.store)),
      new Cron(this.engagementCron, () => void runEngagementPoll(this.store)),
    ];
    logger.info(
      { daemonId: this.daemonId, pollIntervalMs: this.pollIntervalMs },
      'daemon started',
    );
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    try {
      reclaimStaleJobs();
      await this.drain();
    } catch (e) {
      logger.error({ err: (e as Error).message }, 'daemon tick error');
    }
    if (this.running) {
      this.timer = setTimeout(() => void this.tick(), this.pollIntervalMs);
    }
  }

  private async drain(): Promise<void> {
    for (let i = 0; i < DRAIN_BATCH; i += 1) {
      const job = claimDueJob(this.daemonId);
      if (!job) break;
      await processJob(job, { store: this.store, adapter: this.adapter });
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    for (const c of this.crons) c.stop();
    this.crons = [];
    logger.info({ daemonId: this.daemonId }, 'daemon stopped');
  }
}
