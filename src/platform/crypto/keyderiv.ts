import { scryptSync, randomBytes } from 'node:crypto';

const KEY_LEN = 32; // 256-bit key for AES-256-GCM
const SALT_LEN = 16;

// scrypt cost parameters. N must be a power of two; these are a reasonable interactive cost.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/** Derive a 32-byte key from a passphrase + salt using scrypt. */
export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LEN, SCRYPT_PARAMS);
}

/** Generate a fresh random salt (stored per-install, non-secret). */
export function newSalt(): Buffer {
  return randomBytes(SALT_LEN);
}
