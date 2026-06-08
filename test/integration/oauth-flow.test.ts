import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runAuthorizationCodeFlow } from '../../src/auth/oauth-manager.js';
import type { OAuthProfile } from '../../src/auth/profiles/types.js';

/** Listen on an ephemeral port; resolve the chosen port (server kept open). */
function listenEphemeral(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function hitCallbackWithRetry(url: string): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  throw new Error('could not reach loopback callback');
}

describe('OAuth authorization-code flow (loopback + PKCE)', () => {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(close));
  });

  it('exchanges the code for tokens and sends PKCE + client_secret', async () => {
    let receivedBody = '';
    const tokenServer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: 'stub-access-token',
            refresh_token: 'stub-refresh-token',
            expires_in: 3600,
            scope: 'openid w_member_social',
            token_type: 'Bearer',
          }),
        );
      });
    });
    servers.push(tokenServer);
    const tokenPort = await listenEphemeral(tokenServer);

    // Reserve a loopback port for the redirect, then immediately free it for reuse.
    const probe = createServer();
    const loopbackPort = await listenEphemeral(probe);
    await close(probe);

    const profile: OAuthProfile = {
      platform: 'linkedin',
      authorizeUrl: 'http://127.0.0.1:9/authorize',
      tokenUrl: `http://127.0.0.1:${tokenPort}/token`,
      scopes: ['openid', 'w_member_social'],
      usePkce: true,
      scopeSeparator: ' ',
    };

    const outcome = await runAuthorizationCodeFlow({
      profile,
      creds: { clientId: 'client-123', clientSecret: 'secret-xyz' },
      redirectBaseUrl: `http://127.0.0.1:${loopbackPort}`,
      open: false,
      onAuthorizeUrl: (url) => {
        const state = new URL(url).searchParams.get('state') ?? '';
        void hitCallbackWithRetry(
          `http://127.0.0.1:${loopbackPort}/callback?code=test-code&state=${encodeURIComponent(state)}`,
        );
      },
    });

    expect(outcome.accessToken).toBe('stub-access-token');
    expect(outcome.refreshToken).toBe('stub-refresh-token');
    expect(outcome.expiresAt).toBeTypeOf('number');
    expect(outcome.scopes).toContain('w_member_social');

    const body = new URLSearchParams(receivedBody);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('test-code');
    expect(body.get('client_secret')).toBe('secret-xyz');
    expect(body.get('code_verifier')).toBeTruthy(); // PKCE was used
  });

  it('rejects a state mismatch (CSRF guard)', async () => {
    const probe = createServer();
    const loopbackPort = await listenEphemeral(probe);
    await close(probe);

    const profile: OAuthProfile = {
      platform: 'linkedin',
      authorizeUrl: 'http://127.0.0.1:9/authorize',
      tokenUrl: 'http://127.0.0.1:9/token',
      scopes: ['openid'],
      usePkce: false,
    };

    await expect(
      runAuthorizationCodeFlow({
        profile,
        creds: { clientId: 'c', clientSecret: 's' },
        redirectBaseUrl: `http://127.0.0.1:${loopbackPort}`,
        open: false,
        onAuthorizeUrl: () => {
          void hitCallbackWithRetry(
            `http://127.0.0.1:${loopbackPort}/callback?code=x&state=WRONG`,
          );
        },
      }),
    ).rejects.toThrow(/state mismatch/i);
  });
});
