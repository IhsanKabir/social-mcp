import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, journalMode } from '../../src/platform/db/open.js';
import { migrate, latestMigrationId } from '../../src/platform/db/migrate.js';

function tableNames(db: ReturnType<typeof openDb>): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as unknown as {
      name: string;
    }[]
  ).map((r) => r.name);
}

describe('migrate', () => {
  it('creates the expected tables and is idempotent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-mig-'));
    const db = openDb(join(dir, 'state.db'));
    try {
      migrate(db);
      migrate(db); // running again must be a no-op

      const tables = tableNames(db);
      for (const t of ['accounts', 'tokens', 'scheduled_posts', 'jobs', 'publish_log']) {
        expect(tables).toContain(t);
      }

      const applied = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as unknown as {
        n: number;
      };
      expect(applied.n).toBe(latestMigrationId());
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('opens in WAL mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-wal-'));
    const db = openDb(join(dir, 'state.db'));
    try {
      const mode = journalMode(db);
      expect(mode).toBe('wal');
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
