import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for secrets at rest (AES-256-GCM).
 * Payload layout (base64-encoded): iv(12) || authTag(16) || ciphertext.
 * GCM detects tampering: decrypt() throws if the payload was modified.
 */
const IV_LEN = 12;
const TAG_LEN = 16;
const ALGO = 'aes-256-gcm';

export function encrypt(key: Buffer, plaintext: string): string {
  if (key.length !== 32) throw new Error('encrypt: key must be 32 bytes');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(key: Buffer, payload: string): string {
  if (key.length !== 32) throw new Error('decrypt: key must be 32 bytes');
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('decrypt: payload too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
