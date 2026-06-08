import { randomBytes, createHash } from 'node:crypto';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface Pkce {
  verifier: string;
  challenge: string;
  method: 'S256';
}

/** Create a PKCE verifier + S256 challenge (RFC 7636). */
export function createPkce(): Pkce {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge, method: 'S256' };
}

/** Opaque anti-CSRF state value. */
export function randomState(): string {
  return base64url(randomBytes(16));
}
