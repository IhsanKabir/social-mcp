/**
 * Initial schema. Inlined as a string (not a .sql file) so it ships in dist without a
 * build copy step — important for clone-and-run reliability.
 *
 * Tables:
 *  - accounts        : connected social accounts (one per platform login)
 *  - tokens          : encrypted OAuth tokens (1:1 with accounts); only non-secret
 *                      fields (expiry, scopes) are stored in cleartext for sweep queries
 *  - scheduled_posts : post payloads (drafts, queued, published)
 *  - jobs            : the generic work queue shared by the MCP server and the daemon
 *  - publish_log     : idempotency ledger keyed by job id, prevents double-posting
 */
export const migration0001 = /* sql */ `
CREATE TABLE kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE accounts (
  id          TEXT PRIMARY KEY,
  platform    TEXT NOT NULL,
  label       TEXT NOT NULL,
  remote_id   TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_accounts_platform ON accounts(platform);

CREATE TABLE tokens (
  account_id   TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,
  ciphertext   TEXT NOT NULL,
  expires_at   INTEGER,
  scopes       TEXT NOT NULL DEFAULT '[]',
  obtained_at  INTEGER NOT NULL,
  rotated_at   INTEGER,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_tokens_expiry ON tokens(expires_at);

CREATE TABLE scheduled_posts (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,
  text            TEXT,
  media_refs      TEXT NOT NULL DEFAULT '[]',
  visibility      TEXT,
  scheduled_at    INTEGER,
  scheduling_mode TEXT NOT NULL DEFAULT 'local',
  state           TEXT NOT NULL DEFAULT 'draft',
  remote_id       TEXT,
  remote_url      TEXT,
  last_error      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_posts_state ON scheduled_posts(state);
CREATE INDEX idx_posts_account ON scheduled_posts(account_id);

CREATE TABLE jobs (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',
  run_at          INTEGER NOT NULL,
  claimed_by      TEXT,
  claimed_at      INTEGER,
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  next_backoff_ms INTEGER,
  last_error      TEXT,
  payload         TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_jobs_due ON jobs(status, run_at);

CREATE TABLE publish_log (
  idempotency_key TEXT PRIMARY KEY,
  account_id      TEXT,
  platform        TEXT NOT NULL,
  remote_id       TEXT NOT NULL,
  remote_url      TEXT,
  created_at      INTEGER NOT NULL
);
`;
