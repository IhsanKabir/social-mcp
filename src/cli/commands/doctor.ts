import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { paths } from '../../platform/config/paths.js';
import { getDb, journalMode } from '../../platform/db/open.js';
import { latestMigrationId } from '../../platform/db/migrate.js';
import { loadConfig, configExists, configuredPlatforms } from '../../platform/config/load.js';
import { listAccounts } from '../../services/account-registry.js';

/**
 * Diagnostics, printed to stdout (this is the CLI, not the MCP server, so stdout is fine).
 * Reports home dir, DB health, configured platforms, accounts, and security warnings.
 */
export function doctorCommand(): void {
  const lines: string[] = [];
  const ok = (m: string) => lines.push(`  ok    ${m}`);
  const warn = (m: string) => lines.push(`  WARN  ${m}`);
  const info = (m: string) => lines.push(`  info  ${m}`);

  lines.push('social-mcp doctor');
  lines.push('');

  // Home directory
  ok(`home directory: ${paths.root}`);

  // Security: home dir should not live inside a git work tree.
  const gitRoot = findGitTree(paths.root);
  if (gitRoot) {
    warn(`~/.social-mcp is inside a git work tree (${gitRoot}). Secrets could be committed!`);
  } else {
    ok('state directory is outside any git work tree');
  }

  // Database
  try {
    const db = getDb();
    const mode = journalMode(db);
    ok(`database open at ${paths.db} (journal_mode=${mode}, schema v${latestMigrationId()})`);
  } catch (e) {
    warn(`database error: ${(e as Error).message}`);
  }

  // Config
  if (!configExists()) {
    info(`no config yet — copy config.example.json to ${paths.configFile} and run \`social-mcp auth <platform>\``);
  } else {
    try {
      const config = loadConfig();
      const platforms = configuredPlatforms(config);
      if (platforms.length === 0) {
        info('config present but no platforms configured');
      } else {
        ok(`configured platforms: ${platforms.join(', ')}`);
      }
      ok(`token store: ${config.tokenStore}`);
      if (config.ai.anthropicApiKey) ok('Anthropic API key set (daemon autonomous generation enabled)');
      else info('no Anthropic API key — interactive generation works; daemon self-generation disabled');
    } catch (e) {
      warn(`config error: ${(e as Error).message}`);
    }
  }

  // Accounts
  try {
    const accounts = listAccounts();
    ok(`${accounts.length} account(s) connected`);
    for (const a of accounts) {
      info(`  - ${a.platform}/${a.label} [${a.status}]`);
    }
  } catch (e) {
    warn(`could not read accounts: ${(e as Error).message}`);
  }

  process.stdout.write(lines.join('\n') + '\n');
}

/** Walk up from `start` looking for a .git directory; return the work-tree root or null. */
function findGitTree(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
