/** Base class for HTTP-layer failures, carrying enough context for retry decisions. */
export class HttpError extends Error {
  readonly status: number;
  readonly body: string;
  readonly url: string;

  constructor(status: number, url: string, body: string) {
    super(`HTTP ${status} for ${url}: ${truncate(body, 500)}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }

  /** 5xx and 429 are worth retrying; 4xx (except 429) are caller errors. */
  get retryable(): boolean {
    return this.status === 429 || (this.status >= 500 && this.status <= 599);
  }
}

/** Raised on HTTP 429; carries the server's Retry-After hint when present (ms). */
export class RateLimitError extends HttpError {
  readonly retryAfterMs: number | null;

  constructor(url: string, body: string, retryAfterMs: number | null) {
    super(429, url, body);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
