import { createRequire } from 'node:module';
import { paths } from '../config/paths.js';
import { migrate } from './migrate.js';

/**
 * We use Node's built-in `node:sqlite` (DatabaseSync) instead of a native addon like
 * better-sqlite3. This means ZERO native compilation — no Visual Studio / node-gyp — which
 * is essential for the clone-and-run goal. Requires Node >= 22.5 (we require >= 22).
 *
 * It's loaded via createRequire rather than a static `import` so bundlers (Vite/Vitest)
 * don't try to transform the `node:sqlite` specifier — Node resolves the builtin natively.
 *
 * WAL mode + busy_timeout give us concurrent readers and a single writer with contention
 * handled by waiting rather than erroring — the basis of the MCP-server <-> daemon
 * coordination contract (see plan). Each process opens its OWN connection.
 */
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

export type Db = import('node:sqlite').DatabaseSync;

export function openDb(file: string = paths.db): Db {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

let instance: Db | null = null;

/** Process-wide singleton connection, migrated on first use. */
export function getDb(): Db {
  if (!instance) {
    instance = openDb();
    migrate(instance);
  }
  return instance;
}

/** Close the singleton (used by tests and graceful shutdown). */
export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}

/** Read the active journal mode (node:sqlite has no .pragma helper). */
export function journalMode(db: Db): string {
  const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string } | undefined;
  return row?.journal_mode ?? 'unknown';
}

/** Run `fn` inside a transaction; commit on success, rollback on throw. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
