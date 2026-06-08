#!/usr/bin/env node
import { dashboardCommand } from '../cli/commands/dashboard.js';
import { logger } from '../platform/logger.js';

/** Local web dashboard entrypoint. */
dashboardCommand().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  logger.error({ err: message }, 'dashboard failed to start');
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
