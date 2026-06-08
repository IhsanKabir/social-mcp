import { Command } from 'commander';
import { doctorCommand } from './commands/doctor.js';
import { accountsListCommand, accountsRemoveCommand } from './commands/accounts.js';
import { authCommand } from './commands/auth.js';
import { publishCommand } from './commands/publish.js';
import { setupCommand } from './commands/setup.js';
import {
  scheduleCommand,
  queueListCommand,
  queueCancelCommand,
  queueDeadCommand,
  queueRetryCommand,
} from './commands/schedule.js';
import {
  daemonStartCommand,
  daemonStatusCommand,
  daemonStopCommand,
} from './commands/daemon.js';

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('social-mcp')
    .description('Local MCP server + scheduler for managing social media accounts via official APIs')
    .version('0.1.0');

  program
    .command('setup')
    .description('Interactive first-run wizard (pick platforms, enter creds, authorize)')
    .action(() => setupCommand());

  program
    .command('doctor')
    .description('Diagnose configuration, database, and connected accounts')
    .action(() => doctorCommand());

  program
    .command('auth <platform>')
    .description('Connect a social account via OAuth (e.g. `auth linkedin`)')
    .option('--no-browser', "Don't auto-open the browser; print the authorize URL instead")
    .action((platform: string, opts: { browser?: boolean }) =>
      authCommand(platform, { noBrowser: opts.browser === false }),
    );

  program
    .command('publish <accountId>')
    .description('Publish a post now to a connected account')
    .requiredOption('--text <text>', 'Post text')
    .option('--visibility <visibility>', 'public | connections', 'public')
    .option('--idempotency-key <key>', 'Reuse a key to guarantee no double-post')
    .action((accountId: string, opts: { text: string; visibility?: string; idempotencyKey?: string }) =>
      publishCommand(accountId, {
        text: opts.text,
        visibility: opts.visibility,
        idempotencyKey: opts.idempotencyKey,
      }),
    );

  program
    .command('schedule <accountId>')
    .description('Queue a post for later (the daemon publishes it)')
    .requiredOption('--text <text>', 'Post text')
    .option('--at <iso>', 'When to publish (ISO 8601). Omit to publish ASAP.')
    .option('--visibility <visibility>', 'public | connections', 'public')
    .action((accountId: string, opts: { text: string; at?: string; visibility?: string }) =>
      scheduleCommand(accountId, { text: opts.text, at: opts.at, visibility: opts.visibility }),
    );

  const queue = program.command('queue').description('Inspect and manage the post queue');
  queue
    .command('list')
    .description('List scheduled/queued posts')
    .action(() => queueListCommand());
  queue
    .command('cancel <postId>')
    .description('Cancel a scheduled post')
    .action((postId: string) => queueCancelCommand(postId));
  queue
    .command('dead')
    .description('List jobs that exhausted their retries')
    .action(() => queueDeadCommand());
  queue
    .command('retry <jobId>')
    .description('Requeue a dead/failed job')
    .action((jobId: string) => queueRetryCommand(jobId));

  const daemon = program.command('daemon').description('Control the autonomous scheduler daemon');
  daemon
    .command('start')
    .description('Run the scheduler in the foreground')
    .action(() => daemonStartCommand());
  daemon
    .command('status')
    .description('Show daemon and queue status')
    .action(() => daemonStatusCommand());
  daemon
    .command('stop')
    .description('Stop a running daemon')
    .action(() => daemonStopCommand());

  const accounts = program.command('accounts').description('Manage connected accounts');
  accounts
    .command('list')
    .description('List connected accounts and their capabilities')
    .action(() => accountsListCommand());
  accounts
    .command('remove <id>')
    .description('Disconnect an account (also deletes its stored token)')
    .action((id: string) => accountsRemoveCommand(id));

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  await buildProgram().parseAsync(argv);
}
