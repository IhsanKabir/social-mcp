import { writeFileSync, rmSync } from 'node:fs';
import { paths } from '../../platform/config/paths.js';
import { loadConfig } from '../../platform/config/load.js';
import { createTokenStore } from '../../auth/store-factory.js';
import { getEncryptionKey } from '../../auth/key-manager.js';
import { Daemon } from '../../scheduler/daemon.js';
import { daemonStatus, readDaemonPid, isDaemonRunning } from '../../scheduler/status.js';

/** `social-mcp daemon start` — run the scheduler in the foreground until Ctrl+C. */
export async function daemonStartCommand(): Promise<void> {
  const existing = readDaemonPid();
  if (isDaemonRunning(existing)) {
    process.stdout.write(`Daemon already running (pid ${existing}).\n`);
    return;
  }

  const config = loadConfig();
  await getEncryptionKey({ allowPrompt: true });
  const store = createTokenStore(config);

  writeFileSync(paths.daemonPid, String(process.pid));
  const daemon = new Daemon({ store, pollIntervalMs: config.daemon.pollIntervalMs });
  daemon.start();
  process.stdout.write(
    `social-mcp daemon running (pid ${process.pid}, poll ${config.daemon.pollIntervalMs}ms). Ctrl+C to stop.\n`,
  );

  const shutdown = async () => {
    await daemon.stop();
    try {
      rmSync(paths.daemonPid);
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

/** `social-mcp daemon status` — is it running, and what's in the queue. */
export function daemonStatusCommand(): void {
  const s = daemonStatus();
  process.stdout.write(s.running ? `Daemon running (pid ${s.pid}).\n` : 'Daemon not running.\n');
  process.stdout.write(`Jobs: ${s.queued} queued, ${s.inFlight} in-flight, ${s.dead} dead.\n`);
}

/** `social-mcp daemon stop` — signal a running daemon to shut down. */
export function daemonStopCommand(): void {
  const pid = readDaemonPid();
  if (!isDaemonRunning(pid)) {
    process.stdout.write('Daemon not running.\n');
    return;
  }
  try {
    process.kill(pid as number, 'SIGTERM');
    process.stdout.write(`Sent stop signal to pid ${pid}.\n`);
  } catch (e) {
    process.stdout.write(`Could not stop pid ${pid}: ${(e as Error).message}\n`);
  }
}
