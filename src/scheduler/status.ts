import { existsSync, readFileSync } from 'node:fs';
import { paths } from '../platform/config/paths.js';
import { listJobs } from '../queue/job-queue.js';

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  queued: number;
  inFlight: number;
  dead: number;
}

export function readDaemonPid(): number | null {
  if (!existsSync(paths.daemonPid)) return null;
  const n = Number(readFileSync(paths.daemonPid, 'utf8').trim());
  return Number.isFinite(n) ? n : null;
}

/** Check whether a pid is a live process (signal 0 = existence check, cross-platform). */
export function isDaemonRunning(pid: number | null = readDaemonPid()): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function daemonStatus(): DaemonStatus {
  const pid = readDaemonPid();
  return {
    running: isDaemonRunning(pid),
    pid,
    queued: listJobs({ status: 'queued' }).length,
    inFlight: listJobs({ status: 'claimed' }).length + listJobs({ status: 'running' }).length,
    dead: listJobs({ status: 'dead' }).length,
  };
}
