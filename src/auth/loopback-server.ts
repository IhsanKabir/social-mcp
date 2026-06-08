import { createServer, type Server } from 'node:http';

export interface LoopbackResult {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export interface LoopbackOptions {
  port: number;
  host?: string;
  path: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes to complete the browser flow

/**
 * Start an ephemeral HTTP server that captures a single OAuth redirect, responds with a
 * friendly page, then shuts down. Resolves with the callback's query parameters.
 */
export function waitForCallback(opts: LoopbackOptions): Promise<LoopbackResult> {
  return new Promise<LoopbackResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      fn();
    };

    const server: Server = createServer((req, res) => {
      const base = `http://${opts.host ?? 'localhost'}:${opts.port}`;
      const url = new URL(req.url ?? '/', base);
      if (url.pathname !== opts.path) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const p = url.searchParams;
      const result: LoopbackResult = {
        code: p.get('code') ?? undefined,
        state: p.get('state') ?? undefined,
        error: p.get('error') ?? undefined,
        errorDescription: p.get('error_description') ?? undefined,
      };
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(resultPage(result));
      finish(() => resolve(result));
    });

    const timer = setTimeout(
      () => finish(() => reject(new Error('OAuth callback timed out — no redirect received.'))),
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    server.on('error', (err) => finish(() => reject(err)));
    server.listen(opts.port, opts.host ?? 'localhost');
  });
}

function resultPage(r: LoopbackResult): string {
  const okMsg = 'Connected. You can close this tab and return to your terminal.';
  const errMsg = `Authorization failed: ${escapeHtml(r.error ?? 'unknown')}${
    r.errorDescription ? ` — ${escapeHtml(r.errorDescription)}` : ''
  }`;
  const body = r.error ? errMsg : okMsg;
  return `<!doctype html><html><head><meta charset="utf-8"><title>social-mcp</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#0b0b0f;color:#e8e8ee}
.card{padding:2rem 2.5rem;border-radius:14px;background:#16161d;box-shadow:0 10px 40px rgba(0,0,0,.4);max-width:30rem;text-align:center}
h1{font-size:1.1rem;margin:0 0 .5rem}</style></head>
<body><div class="card"><h1>social-mcp</h1><p>${body}</p></div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
