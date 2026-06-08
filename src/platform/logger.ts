import pino, { type StreamEntry } from 'pino';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { paths } from './config/paths.js';

/**
 * CRITICAL: the MCP server speaks JSON-RPC over stdout. Logging MUST NEVER write to
 * stdout or it corrupts the protocol stream. We log to stderr (fd 2) and to a rotating
 * file under ~/.social-mcp/logs. Nothing here ever touches stdout.
 */
const level = (process.env.SOCIAL_MCP_LOG_LEVEL ?? 'info') as pino.LevelWithSilent;

const streams: StreamEntry[] = [{ stream: process.stderr }];

try {
  const file = join(paths.logsDir, 'social-mcp.log');
  streams.push({ stream: createWriteStream(file, { flags: 'a' }) });
} catch {
  // If the log file can't be opened, stderr alone is sufficient.
}

export const logger = pino({ level, base: { pid: process.pid } }, pino.multistream(streams));

export type Logger = typeof logger;
