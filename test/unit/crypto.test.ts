import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../src/platform/crypto/envelope.js';
import { deriveKey, newSalt } from '../../src/platform/crypto/keyderiv.js';

describe('crypto envelope (AES-256-GCM)', () => {
  const key = deriveKey('correct horse battery staple', newSalt());

  it('round-trips plaintext and does not leak it', () => {
    const ct = encrypt(key, 'hello secret token');
    expect(ct).not.toContain('hello');
    expect(decrypt(key, ct)).toBe('hello secret token');
  });

  it('detects tampering (auth tag)', () => {
    const ct = encrypt(key, 'tamper me');
    const buf = Buffer.from(ct, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext bit
    expect(() => decrypt(key, buf.toString('base64'))).toThrow();
  });

  it('fails to decrypt with the wrong key', () => {
    const ct = encrypt(key, 'secret');
    const wrong = deriveKey('different passphrase', newSalt());
    expect(() => decrypt(wrong, ct)).toThrow();
  });

  it('rejects non-32-byte keys', () => {
    expect(() => encrypt(Buffer.alloc(16), 'x')).toThrow();
  });
});

describe('keyderiv (scrypt)', () => {
  it('derives a deterministic 32-byte key for a given passphrase+salt', () => {
    const salt = newSalt();
    const k1 = deriveKey('pw', salt);
    const k2 = deriveKey('pw', salt);
    expect(k1).toHaveLength(32);
    expect(k1.equals(k2)).toBe(true);
  });

  it('produces different keys for different salts', () => {
    const a = deriveKey('pw', newSalt());
    const b = deriveKey('pw', newSalt());
    expect(a.equals(b)).toBe(false);
  });
});
