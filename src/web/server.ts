import { createServer, type Server, type ServerResponse } from 'node:http';
import { listAccounts } from '../services/account-registry.js';
import { listPosts, cancelPost } from '../queue/posts-repo.js';
import { listMentions } from '../services/mentions-repo.js';
import { getInsightsCache } from '../services/insights-cache.js';
import { daemonStatus } from '../scheduler/status.js';
import { capabilitiesFor } from '../adapters/capabilities.js';
import { renderDashboardPage } from './page.js';

function json(res: ServerResponse, code: number, data: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * The local dashboard HTTP server. Read-mostly (one POST to cancel a post). Tokens/secrets are
 * never exposed. Bind to 127.0.0.1 only (the CLI command does this).
 */
export function createDashboardServer(): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderDashboardPage());
      return;
    }

    if (method === 'GET' && path === '/api/accounts') {
      json(
        res,
        200,
        listAccounts().map((a) => ({ ...a, capabilities: capabilitiesFor(a.platform) })),
      );
      return;
    }
    if (method === 'GET' && path === '/api/queue') {
      json(res, 200, listPosts());
      return;
    }
    if (method === 'GET' && path === '/api/mentions') {
      json(res, 200, listMentions());
      return;
    }
    if (method === 'GET' && path === '/api/status') {
      json(res, 200, daemonStatus());
      return;
    }
    if (method === 'GET' && path === '/api/insights') {
      json(
        res,
        200,
        listAccounts().map((a) => ({
          accountId: a.id,
          label: a.label,
          platform: a.platform,
          cached: getInsightsCache(a.id),
        })),
      );
      return;
    }
    if (method === 'POST' && path === '/api/cancel') {
      const ok = cancelPost(url.searchParams.get('postId') ?? '');
      json(res, ok ? 200 : 404, { canceled: ok });
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  });
}
