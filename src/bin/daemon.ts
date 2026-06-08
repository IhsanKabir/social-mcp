#!/usr/bin/env node
import { daemonStartCommand } from '../cli/commands/daemon.js';
import { logger } from '../platform/logger.js';

/** Autonomous scheduler daemon entrypoint. Runs in the foreground until stopped. */
daemonStartCommand().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  logger.error({ err: message }, 'daemon failed to start');
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
