import { getDb } from '../platform/db/open.js';
import { deriveKey, newSalt } from '../platform/crypto/keyderiv.js';
import { password } from '@inquirer/prompts';

/**
 * Resolves the symmetric key used to encrypt tokens at rest. The key is derived (scrypt)
 * from a passphrase + a per-install random salt (stored in the kv table; non-secret). The
 * passphrase itself is NEVER persisted — it comes from the SOCIAL_MCP_KEY env var, or an
 * interactive prompt in the CLI. The derived key is cached in-process only.
 *
 * Consequence (documented): the daemon and MCP server are separate processes and need the
 * passphrase too, so SOCIAL_MCP_KEY must be set in their environment.
 */
const SALT_KEY = 'crypto_salt';
let cachedKey: Buffer | null = null;

function getOrCreateSalt(): Buffer {
  const db = getDb();
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(SALT_KEY) as unknown as
    | { value: string }
    | undefined;
  if (row) return Buffer.from(row.value, 'base64');
  const salt = newSalt();
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run(SALT_KEY, salt.toString('base64'));
  return salt;
}

export interface KeyOptions {
  /** Allow an interactive passphrase prompt (CLI only; never in daemon/MCP). */
  allowPrompt?: boolean;
}

export async function getEncryptionKey(opts: KeyOptions = {}): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  const salt = getOrCreateSalt();

  let passphrase = process.env.SOCIAL_MCP_KEY;
  if (!passphrase) {
    if (opts.allowPrompt && process.stdin.isTTY) {
      passphrase = await password({
        message: 'Set/enter your social-mcp encryption passphrase (encrypts your OAuth tokens):',
      });
    } else {
      throw new Error(
        'Encryption passphrase not set. Set the SOCIAL_MCP_KEY environment variable so tokens can be encrypted/decrypted at rest (also set it in your daemon and MCP-server environment).',
      );
    }
  }
  if (!passphrase) throw new Error('Empty encryption passphrase.');

  cachedKey = deriveKey(passphrase, salt);
  return cachedKey;
}

/** Test/utility hook to clear the cached key. */
export function resetKeyCache(): void {
  cachedKey = null;
}
