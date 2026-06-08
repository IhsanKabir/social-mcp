/**
 * Phase 7 caches:
 *  - insights_cache : latest account-level metrics per account (refreshed by the daemon)
 *  - mentions       : comments discovered on published posts, for the hybrid-approval reply
 *                     flow (status: new -> drafted -> replied / ignored)
 */
export const migration0002 = /* sql */ `
CREATE TABLE insights_cache (
  account_id  TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  json        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE mentions (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  post_remote_id TEXT,
  author         TEXT,
  text           TEXT,
  created_at     INTEGER,
  fetched_at     INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'new'
);
CREATE INDEX idx_mentions_account ON mentions(account_id, status);
`;
