import type { Db } from './open.js';
import { transaction } from './open.js';
import { migration0001 } from './migrations/0001_init.js';
import { migration0002 } from './migrations/0002_engagement.js';

interface Migration {
  id: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  { id: 1, name: 'init', sql: migration0001 },
  { id: 2, name: 'engagement', sql: migration0002 },
];

/**
 * Apply any not-yet-applied migrations inside a transaction. Idempotent: running it on an
 * up-to-date database is a no-op. Tracked in the schema_migrations table.
 */
export function migrate(db: Db): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at INTEGER NOT NULL
     );`,
  );

  const appliedRows = db.prepare('SELECT id FROM schema_migrations').all() as unknown as {
    id: number;
  }[];
  const applied = new Set(appliedRows.map((r) => r.id));

  const record = db.prepare(
    'INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)',
  );

  transaction(db, () => {
    for (const m of MIGRATIONS) {
      if (applied.has(m.id)) continue;
      db.exec(m.sql);
      record.run(m.id, m.name, Date.now());
    }
  });
}

/** Highest migration id known to this build (for diagnostics). */
export function latestMigrationId(): number {
  return MIGRATIONS.reduce((max, m) => Math.max(max, m.id), 0);
}
