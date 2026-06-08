#!/usr/bin/env node
import { runCli } from '../cli/index.js';
import { logger } from '../platform/logger.js';

runCli(process.argv).catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  logger.error({ err: message }, 'cli failed');
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
