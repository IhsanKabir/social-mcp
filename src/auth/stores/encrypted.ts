import type { TokenStore, StoredToken, TokenSummary } from '../token-store.js';
import type { PlatformId } from '../../platform/ids.js';
import { getDb } from '../../platform/db/open.js';
import { encrypt, decrypt } from '../../platform/crypto/envelope.js';
import { getEncryptionKey, type KeyOptions } from '../key-manager.js';

interface CipherRow {
  ciphertext: string;
}

interface SummaryRow {
  account_id: string;
  platform: string;
  scopes: string;
  expires_at: number | null;
}

/**
 * Default token store. The full StoredToken is JSON-encoded and AES-256-GCM encrypted into
 * the tokens.ciphertext column. Only non-secret fields (expires_at, scopes) are mirrored in
 * cleartext columns so the daemon's refresh sweep can query by expiry without decrypting.
 */
export class EncryptedTokenStore implements TokenStore {
  private readonly keyOpts: KeyOptions;

  constructor(keyOpts: KeyOptions = {}) {
    this.keyOpts = keyOpts;
  }

  async set(token: StoredToken): Promise<void> {
    const key = await getEncryptionKey(this.keyOpts);
    const ciphertext = encrypt(key, JSON.stringify(token));
    const now = Date.now();
    getDb()
      .prepare(
        `INSERT INTO tokens
           (account_id, platform, ciphertext, expires_at, scopes, obtained_at, rotated_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           platform   = excluded.platform,
           ciphertext = excluded.ciphertext,
           expires_at = excluded.expires_at,
           scopes     = excluded.scopes,
           rotated_at = excluded.rotated_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        token.accountId,
        token.platform,
        ciphertext,
        token.expiresAt ?? null,
        JSON.stringify(token.scopes),
        token.obtainedAt,
        token.rotatedAt ?? null,
        now,
      );
  }

  async get(accountId: string): Promise<StoredToken | null> {
    const row = getDb()
      .prepare('SELECT ciphertext FROM tokens WHERE account_id = ?')
      .get(accountId) as unknown as CipherRow | undefined;
    if (!row) return null;
    const key = await getEncryptionKey(this.keyOpts);
    return JSON.parse(decrypt(key, row.ciphertext)) as StoredToken;
  }

  async delete(accountId: string): Promise<void> {
    getDb().prepare('DELETE FROM tokens WHERE account_id = ?').run(accountId);
  }

  async list(): Promise<TokenSummary[]> {
    const rows = getDb()
      .prepare('SELECT account_id, platform, scopes, expires_at FROM tokens')
      .all() as unknown as SummaryRow[];
    return rows.map((r) => ({
      accountId: r.account_id,
      platform: r.platform as PlatformId,
      scopes: JSON.parse(r.scopes) as string[],
      expiresAt: r.expires_at,
    }));
  }

  async expiringBefore(beforeMs: number): Promise<StoredToken[]> {
    const rows = getDb()
      .prepare('SELECT ciphertext FROM tokens WHERE expires_at IS NOT NULL AND expires_at < ?')
      .all(beforeMs) as unknown as CipherRow[];
    const key = await getEncryptionKey(this.keyOpts);
    return rows.map((r) => JSON.parse(decrypt(key, r.ciphertext)) as StoredToken);
  }
}
