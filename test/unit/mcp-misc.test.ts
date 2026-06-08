import { describe, it, expect } from 'vitest';
import { textResult, jsonResult, errorResult, guard } from '../../src/mcp/result.js';
import { FacebookAdapter } from '../../src/adapters/facebook/adapter.js';
import { InstagramAdapter } from '../../src/adapters/instagram/adapter.js';
import { ThreadsAdapter } from '../../src/adapters/threads/adapter.js';
import { YouTubeAdapter } from '../../src/adapters/youtube/adapter.js';
import { LinkedInAdapter } from '../../src/adapters/linkedin/adapter.js';
import { CapabilityError } from '../../src/adapters/capability-error.js';
import type { AuthContext } from '../../src/adapters/types.js';

function text(r: { content: { text?: string }[] }): string {
  return r.content[0]?.text ?? '';
}

describe('mcp result helpers', () => {
  it('formats text, json, and error results', async () => {
    expect(text(textResult('hi'))).toBe('hi');
    expect(JSON.parse(text(jsonResult({ x: 1 }))).x).toBe(1);
    const err = errorResult('boom');
    expect(err.isError).toBe(true);
    expect(text(err)).toBe('boom');
  });

  it('guard turns a thrown error into an isError result', async () => {
    const ok = await guard(() => textResult('fine'));
    expect(ok.isError).toBeUndefined();
    const bad = await guard(() => {
      throw new Error('nope');
    });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain('nope');
  });
});

describe('adapter getMentions (no-op in v1)', () => {
  const auth: AuthContext = { accessToken: 't', meta: {} };
  it('returns empty arrays for Meta/YouTube and throws for LinkedIn', async () => {
    expect(await new FacebookAdapter().getMentions('a', auth)).toEqual([]);
    expect(await new InstagramAdapter().getMentions('a', auth)).toEqual([]);
    expect(await new ThreadsAdapter().getMentions('a', auth)).toEqual([]);
    expect(await new YouTubeAdapter().getMentions('a', auth)).toEqual([]);
    await expect(new LinkedInAdapter().getMentions('a', auth)).rejects.toBeInstanceOf(CapabilityError);
  });
});
