import { describe, it, expect, vi, afterEach } from 'vitest';
import { request, requestJson } from '../../src/platform/http/client.js';
import { HttpError, RateLimitError } from '../../src/platform/http/errors.js';

afterEach(() => vi.unstubAllGlobals());

describe('http client', () => {
  it('retries retryable 5xx then succeeds', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async () => {
      n += 1;
      if (n < 3) return new Response('busy', { status: 503 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const data = await requestJson<{ ok: boolean }>('http://x/y', { retries: 5 });
    expect(data.ok).toBe(true);
    expect(n).toBe(3);
  });

  it('throws RateLimitError on 429 after exhausting retries', async () => {
    vi.stubGlobal('fetch', async () => new Response('slow down', { status: 429 }));
    await expect(request('http://x/y', { retries: 0 })).rejects.toBeInstanceOf(RateLimitError);
  });

  it('does not retry a 400 and throws HttpError', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async () => {
      n += 1;
      return new Response('bad', { status: 400 });
    });
    await expect(request('http://x/y', { retries: 3 })).rejects.toBeInstanceOf(HttpError);
    expect(n).toBe(1); // 400 is not retryable
  });

  it('encodes json body and sets content-type', async () => {
    let seenBody = '';
    let seenCt = '';
    vi.stubGlobal('fetch', async (_u: unknown, init: { body?: string; headers?: Record<string, string> }) => {
      seenBody = init.body ?? '';
      seenCt = (init.headers ?? {})['content-type'] ?? '';
      return new Response('{}', { status: 200 });
    });
    await request('http://x', { method: 'POST', json: { a: 1 } });
    expect(JSON.parse(seenBody).a).toBe(1);
    expect(seenCt).toContain('application/json');
  });

  it('HttpError.retryable is true for 5xx/429 and false for 4xx', () => {
    expect(new HttpError(500, 'u', 'b').retryable).toBe(true);
    expect(new HttpError(503, 'u', 'b').retryable).toBe(true);
    expect(new HttpError(404, 'u', 'b').retryable).toBe(false);
    expect(new RateLimitError('u', 'b', 1000).retryAfterMs).toBe(1000);
  });
});
