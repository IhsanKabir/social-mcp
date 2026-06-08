import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createPkce, randomState } from '../../src/auth/pkce.js';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('pkce', () => {
  it('creates an S256 challenge that matches the verifier', () => {
    const { verifier, challenge, method } = createPkce();
    expect(method).toBe('S256');
    expect(challenge).toBe(b64url(createHash('sha256').update(verifier).digest()));
  });

  it('produces url-safe values (no +, /, =)', () => {
    const { verifier, challenge } = createPkce();
    expect(verifier).not.toMatch(/[+/=]/);
    expect(challenge).not.toMatch(/[+/=]/);
  });

  it('generates distinct state values', () => {
    expect(randomState()).not.toBe(randomState());
  });
});
