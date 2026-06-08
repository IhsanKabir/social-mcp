import { writeFileSync } from 'node:fs';
import { checkbox, input, password, confirm } from '@inquirer/prompts';
import { paths } from '../../platform/config/paths.js';
import { loadConfig } from '../../platform/config/load.js';
import { configSchema, type AppConfig } from '../../platform/config/schema.js';
import { PLATFORMS, type PlatformId } from '../../platform/ids.js';
import { getEncryptionKey } from '../../auth/key-manager.js';
import { authCommand } from './auth.js';

const PLATFORM_LABELS: Record<PlatformId, string> = {
  linkedin: 'LinkedIn (no app review — easiest)',
  facebook: 'Facebook Pages (Meta app)',
  instagram: 'Instagram (Meta app)',
  threads: 'Threads (Threads app)',
  youtube: 'YouTube (Google Cloud project)',
  tiktok: 'TikTok (draft-only — public posting needs app audit)',
};

const REDIRECT_HINT = (config: AppConfig) => `${config.oauth.redirectBaseUrl}/callback`;

/** Interactive first-run wizard: pick platforms, enter creds, write config, optionally auth. */
export async function setupCommand(): Promise<void> {
  process.stdout.write('social-mcp setup\n\n');

  let config: AppConfig;
  try {
    config = loadConfig();
  } catch {
    config = configSchema.parse({});
  }

  const selectable = PLATFORMS;
  const chosen = (await checkbox({
    message: 'Which platforms do you want to configure? (Space to toggle, Enter to confirm)',
    choices: selectable.map((p) => ({
      name: PLATFORM_LABELS[p],
      value: p,
      checked: Boolean(config.platforms[p]),
    })),
  })) as PlatformId[];

  if (chosen.length === 0) {
    process.stdout.write('No platforms selected. Nothing to do.\n');
    return;
  }

  const platforms = { ...config.platforms };
  for (const p of chosen) {
    process.stdout.write(`\n— ${PLATFORM_LABELS[p]} —\n`);
    process.stdout.write(`  Register this redirect URL in the app: ${REDIRECT_HINT(config)}\n`);
    const existing = config.platforms[p];
    const clientId = await input({
      message: `${p} client id (App ID):`,
      default: existing?.clientId,
    });
    const clientSecret = await password({ message: `${p} client secret (App secret):` });
    platforms[p] = { clientId, clientSecret };
  }

  const next: AppConfig = { ...config, platforms };
  writeFileSync(paths.configFile, JSON.stringify(next, null, 2));
  process.stdout.write(`\n✓ Wrote ${paths.configFile}\n`);

  if (!process.env.SOCIAL_MCP_KEY) {
    process.stdout.write(
      '\nNOTE: SOCIAL_MCP_KEY is not set. It encrypts your tokens at rest and MUST be the same\n' +
        'value whenever you run the CLI, daemon, or MCP server. Set it in your environment, e.g.\n' +
        '  PowerShell:  $env:SOCIAL_MCP_KEY = "your-passphrase"\n' +
        'You will be prompted for it now to initialize encryption.\n',
    );
  }
  await getEncryptionKey({ allowPrompt: true });

  const doAuth = await confirm({
    message: 'Authorize the selected accounts now (opens your browser per platform)?',
    default: true,
  });
  if (doAuth) {
    for (const p of chosen) {
      try {
        process.stdout.write(`\nAuthorizing ${p}…\n`);
        await authCommand(p, {});
      } catch (e) {
        process.stdout.write(`  Skipped ${p}: ${(e as Error).message}\n`);
      }
    }
  }

  process.stdout.write(
    '\nDone. Next:\n' +
      '  • Start the scheduler:   social-mcp daemon start\n' +
      '  • Check health:          social-mcp doctor\n' +
      '  • Wire into Claude Desktop (mcpServers entry) — see README.\n',
  );
}
