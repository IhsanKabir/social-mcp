import { HttpError, RateLimitError } from './errors.js';
import { logger } from '../logger.js';

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Raw body (string/bytes) or use `json` for a value to be JSON-encoded. */
  body?: string | Uint8Array | FormData | null;
  json?: unknown;
  /** Max retry attempts for retryable failures (429/5xx/network). Default 3. */
  retries?: number;
  /** AbortSignal for cancellation/timeout. */
  signal?: AbortSignal;
  /** Per-attempt timeout in ms (default 30s). */
  timeoutMs?: number;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 15_000;

/**
 * fetch wrapper with JSON helpers, exponential backoff for 429/5xx/network errors, and
 * Retry-After support. Deterministic backoff (no jitter) keeps tests reproducible; the
 * scheduler layer adds its own spacing between jobs.
 */
export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const headers: Record<string, string> = { ...opts.headers };

  let body = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['content-type'] = headers['content-type'] ?? 'application/json';
  }

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      const res = await withTimeout(
        (signal) => fetch(url, { method: opts.method ?? 'GET', headers, body, signal }),
        opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        opts.signal,
      );

      if (res.ok) return res;

      const text = await res.text();
      const err =
        res.status === 429
          ? new RateLimitError(url, text, parseRetryAfter(res.headers.get('retry-after')))
          : new HttpError(res.status, url, text);

      if (!err.retryable || attempt > retries) throw err;
      await sleep(backoffMs(attempt, err instanceof RateLimitError ? err.retryAfterMs : null));
      logger.warn({ url, status: res.status, attempt }, 'retrying request');
    } catch (e) {
      if (e instanceof HttpError) throw e; // already handled above
      // Network/abort/timeout error: retry if attempts remain.
      if (attempt > retries) throw e;
      await sleep(backoffMs(attempt, null));
      logger.warn({ url, attempt, err: (e as Error).message }, 'retrying request (network)');
    }
  }
}

/** Convenience: request + parse JSON. Throws on non-2xx (via request). */
export async function requestJson<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(url, opts);
  return (await res.json()) as T;
}

function backoffMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs != null) return Math.min(retryAfterMs, MAX_BACKOFF_MS);
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (!Number.isNaN(secs)) return secs * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(
  fn: (signal: AbortSignal) => Promise<Response>,
  timeoutMs: number,
  external?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  external?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}
