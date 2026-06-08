import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { publishLinkedInPost } from '../../src/adapters/linkedin/publish.js';
import { LinkedInAdapter } from '../../src/adapters/linkedin/adapter.js';
import { CapabilityError } from '../../src/adapters/capability-error.js';

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}
function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('publishLinkedInPost', () => {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(close));
  });

  it('sends the right headers/body and parses the created post id', async () => {
    let headers: IncomingHttpHeaders = {};
    let body = '';
    const server = createServer((req, res) => {
      headers = req.headers;
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        body = Buffer.concat(chunks).toString('utf8');
        res.writeHead(201, { 'x-restli-id': 'urn:li:share:789' });
        res.end();
      });
    });
    servers.push(server);
    const port = await listen(server);

    const result = await publishLinkedInPost({
      text: 'hello world',
      authorUrn: 'urn:li:person:abc',
      accessToken: 'tok-123',
      visibility: 'public',
      baseUrl: `http://127.0.0.1:${port}`,
    });

    expect(result.remoteId).toBe('urn:li:share:789');
    expect(result.url).toContain('urn:li:share:789');
    expect(result.state).toBe('published');

    expect(headers['authorization']).toBe('Bearer tok-123');
    expect(headers['linkedin-version']).toBeTruthy();
    expect(headers['x-restli-protocol-version']).toBe('2.0.0');

    const parsed = JSON.parse(body);
    expect(parsed.author).toBe('urn:li:person:abc');
    expect(parsed.commentary).toBe('hello world');
    expect(parsed.visibility).toBe('PUBLIC');
    expect(parsed.lifecycleState).toBe('PUBLISHED');
  });

  it('maps connections visibility', async () => {
    let body = '';
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        body = Buffer.concat(chunks).toString('utf8');
        res.writeHead(201, { 'x-restli-id': 'urn:li:share:1' });
        res.end();
      });
    });
    servers.push(server);
    const port = await listen(server);

    await publishLinkedInPost({
      text: 'x',
      authorUrn: 'urn:li:person:abc',
      accessToken: 't',
      visibility: 'connections',
      baseUrl: `http://127.0.0.1:${port}`,
    });
    expect(JSON.parse(body).visibility).toBe('CONNECTIONS');
  });
});

describe('LinkedInAdapter capability boundaries', () => {
  const adapter = new LinkedInAdapter();
  const auth = { accessToken: 't', meta: { authorUrn: 'urn:li:person:x' } };

  it('rejects media publishing with CapabilityError', async () => {
    await expect(
      adapter.publish(
        { accountId: 'a', text: 'hi', idempotencyKey: 'k', media: [{ path: '/x.jpg', mime: 'image/jpeg' }] },
        auth,
      ),
    ).rejects.toBeInstanceOf(CapabilityError);
  });

  it('throws CapabilityError for unsupported engagement/analytics', async () => {
    await expect(adapter.getComments('id', auth)).rejects.toBeInstanceOf(CapabilityError);
    await expect(adapter.reply('c', 't', auth)).rejects.toBeInstanceOf(CapabilityError);
    await expect(adapter.getInsights(null, auth)).rejects.toBeInstanceOf(CapabilityError);
  });

  it('requires an author URN on the token', async () => {
    await expect(
      adapter.publish({ accountId: 'a', text: 'hi', idempotencyKey: 'k' }, { accessToken: 't' }),
    ).rejects.toThrow(/author URN/i);
  });

  it('refreshAuth returns null (no refresh on open-access tier)', async () => {
    const profile = { platform: 'linkedin' as const, authorizeUrl: '', tokenUrl: '', scopes: [], usePkce: false };
    const token = {
      accountId: 'a',
      platform: 'linkedin' as const,
      accessToken: 't',
      scopes: [],
      obtainedAt: Date.now(),
    };
    expect(await adapter.refreshAuth(token, profile)).toBeNull();
  });
});
