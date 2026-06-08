import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * All persistent state lives OUTSIDE the repo, under ~/.social-mcp (overridable via
 * SOCIAL_MCP_HOME, which is also how the test suite isolates state). This keeps secrets
 * and the database out of any git work tree.
 */
const root = process.env.SOCIAL_MCP_HOME ?? join(homedir(), '.social-mcp');

export const paths = {
  root,
  configFile: join(root, 'config.json'),
  db: join(root, 'state.db'),
  mediaDir: join(root, 'media'),
  logsDir: join(root, 'logs'),
  daemonPid: join(root, 'daemon.pid'),
} as const;

/** Create the home directory tree. Idempotent; safe to call repeatedly. */
export function ensureDirs(): void {
  for (const dir of [paths.root, paths.mediaDir, paths.logsDir]) {
    mkdirSync(dir, { recursive: true });
  }
}

// Ensure the tree exists as soon as anything touches paths, so downstream modules
// (logger file stream, db open) never race a missing directory.
ensureDirs();
